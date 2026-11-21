from __future__ import annotations

import ipaddress
import re
import socket
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


ROOT = Path(__file__).resolve().parents[4]
DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024 * 1024  # 50 MiB
DEFAULT_DISCOVERY_USER_AGENT = (
    "Mozilla/5.0 (compatible; ProjectBabelObservatory/0.2; +https://project-babel.com)"
)
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
)

PUBLIC_SUFFIX_HOSTS = frozenset(
    {
        "europa.eu",
        "go.jp",
        "or.jp",
        "ac.jp",
        "co.jp",
        "ne.jp",
        "go.kr",
        "or.kr",
        "ac.kr",
        "re.kr",
        "co.kr",
        "gov.cn",
        "org.cn",
        "edu.cn",
        "ac.cn",
        "com.cn",
        "gov.uk",
        "org.uk",
        "co.uk",
        "ac.uk",
        "gov.au",
        "gov.sg",
    }
)

BLOCKED_HOST_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".home.arpa",
    ".localdomain",
)
BLOCKED_EXACT_HOSTS = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
    }
)

META_CHARSET_PATTERN = re.compile(
    rb"<meta[^>]+charset=['\"]?\s*([a-zA-Z0-9._-]+)",
    re.IGNORECASE,
)
CONTENT_TYPE_CHARSET_PATTERN = re.compile(
    r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)",
    re.IGNORECASE,
)
FALLBACK_HTML_ENCODINGS = (
    "utf-8",
    "gb18030",
    "cp932",
    "shift_jis",
    "euc-jp",
    "cp949",
    "euc-kr",
)


class UnsafeURLError(ValueError):
    """Raised when a URL fails scheme, host, or public-IP SSRF checks."""


def repo_rel_posix(path: Path, *, root: Path | None = None) -> str:
    base = root if root is not None else ROOT
    try:
        return path.relative_to(base).as_posix()
    except ValueError:
        return path.as_posix()


def is_public_ip(ip_value: str) -> bool:
    try:
        parsed_ip = ipaddress.ip_address(ip_value)
    except ValueError:
        return False
    if isinstance(parsed_ip, ipaddress.IPv6Address) and parsed_ip.ipv4_mapped is not None:
        parsed_ip = parsed_ip.ipv4_mapped
    return bool(parsed_ip.is_global) and not (
        parsed_ip.is_private
        or parsed_ip.is_loopback
        or parsed_ip.is_link_local
        or parsed_ip.is_multicast
        or parsed_ip.is_reserved
        or parsed_ip.is_unspecified
    )


def _looks_like_noncanonical_ipv4(hostname: str) -> bool:
    """Detect decimal/hex/octal/shorthand IPv4 literals (e.g. 2130706433, 0x7f000001, 127.1, 0177.0.0.1)."""
    parts = hostname.split(".")
    if not (1 <= len(parts) <= 4):
        return False
    numeric_parts = True
    has_noncanonical_form = len(parts) < 4
    for part in parts:
        if not part:
            return True
        if part.startswith(("0x", "0X")):
            try:
                int(part, 16)
                has_noncanonical_form = True
                continue
            except ValueError:
                numeric_parts = False
                break
        if part.isdigit():
            if len(part) > 1 and part.startswith("0"):
                has_noncanonical_form = True
            continue
        numeric_parts = False
        break
    return numeric_parts and has_noncanonical_form


def validate_public_http_url(url: str, *, resolve_dns: bool = True) -> str:
    if not isinstance(url, str) or not url.strip():
        raise UnsafeURLError("URL must be a non-empty string")
    candidate = url.strip()
    parsed = urlparse(candidate)
    scheme = (parsed.scheme or "").lower()
    if scheme not in {"http", "https"}:
        raise UnsafeURLError(f"disallowed URL scheme '{scheme or 'missing'}' in {candidate}")

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        raise UnsafeURLError(f"URL is missing a hostname: {candidate}")

    if hostname in BLOCKED_EXACT_HOSTS or any(hostname.endswith(suffix) for suffix in BLOCKED_HOST_SUFFIXES):
        raise UnsafeURLError(f"disallowed private/local hostname '{hostname}' in {candidate}")

    if _looks_like_noncanonical_ipv4(hostname):
        raise UnsafeURLError(f"disallowed non-canonical IPv4 literal '{hostname}' in {candidate}")

    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        is_ip_literal = False
    else:
        is_ip_literal = True

    if is_ip_literal:
        if not is_public_ip(hostname):
            raise UnsafeURLError(f"disallowed non-public IP address '{hostname}' in {candidate}")
        return candidate

    if "." not in hostname:
        raise UnsafeURLError(f"disallowed single-label hostname '{hostname}' in {candidate}")

    if resolve_dns:
        port = parsed.port or (443 if scheme == "https" else 80)
        try:
            addr_infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise UnsafeURLError(f"failed to resolve hostname '{hostname}': {exc}") from exc
        resolved_ips = {info[4][0] for info in addr_infos if info and info[4]}
        if not resolved_ips:
            raise UnsafeURLError(f"hostname '{hostname}' resolved to no addresses")
        for ip_addr in resolved_ips:
            if not is_public_ip(ip_addr):
                raise UnsafeURLError(
                    f"hostname '{hostname}' resolved to non-public IP '{ip_addr}'"
                )

    return candidate


class SafeRedirectHandler(HTTPRedirectHandler):
    """Validates every HTTP redirect target against SSRF/public-IP rules."""

    def __init__(self, *, resolve_dns: bool = True) -> None:
        super().__init__()
        self.resolve_dns = resolve_dns

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        resolved_target = urljoin(req.full_url, newurl)
        validate_public_http_url(resolved_target, resolve_dns=self.resolve_dns)
        return super().redirect_request(req, fp, code, msg, headers, resolved_target)


def safe_urlopen(
    url_or_request: str | Request,
    *,
    timeout: int = 30,
    resolve_dns: bool = True,
) -> Any:
    target_url = url_or_request.full_url if isinstance(url_or_request, Request) else str(url_or_request)
    validate_public_http_url(target_url, resolve_dns=resolve_dns)
    opener = build_opener(SafeRedirectHandler(resolve_dns=resolve_dns))
    return opener.open(url_or_request, timeout=timeout)


def read_bounded(response: Any, max_bytes: int = DEFAULT_MAX_RESPONSE_BYTES) -> bytes:
    """Read an HTTP response body while enforcing an upper memory limit."""
    if max_bytes < 1:
        raise ValueError("max_bytes must be positive")
    chunks: list[bytes] = []
    total = 0
    chunk_size = min(65536, max_bytes + 1)
    while True:
        try:
            chunk = response.read(chunk_size)
        except TypeError:
            # Test fakes sometimes define `read(self)` without a size parameter.
            chunk = response.read()
            if not isinstance(chunk, (bytes, bytearray)):
                raise ValueError("response.read() must return bytes")
            if len(chunk) > max_bytes:
                raise ValueError(f"response exceeded maximum size of {max_bytes} bytes")
            return bytes(chunk)
        if not chunk:
            break
        if not isinstance(chunk, (bytes, bytearray)):
            raise ValueError("response.read() must return bytes")
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"response exceeded maximum size of {max_bytes} bytes")
        chunks.append(bytes(chunk))
    return b"".join(chunks)


def _is_registrable_host(host: str) -> bool:
    if not host or "." not in host:
        return False
    if host in PUBLIC_SUFFIX_HOSTS:
        return False
    labels = [label for label in host.split(".") if label]
    if len(labels) < 2:
        return False
    if ".".join(labels[-2:]) in PUBLIC_SUFFIX_HOSTS and len(labels) < 3:
        return False
    return True


def same_host_family(base_url: str, candidate_url: str) -> bool:
    base_parsed = urlparse(base_url)
    candidate_parsed = urlparse(candidate_url)
    if base_parsed.scheme.lower() not in {"http", "https"} or candidate_parsed.scheme.lower() not in {"http", "https"}:
        return False

    base_host = (base_parsed.hostname or "").lower().rstrip(".")
    candidate_host = (candidate_parsed.hostname or "").lower().rstrip(".")
    if not _is_registrable_host(base_host) or not _is_registrable_host(candidate_host):
        return False

    if base_host.endswith(".europa.eu") and candidate_host.endswith(".europa.eu"):
        return True
    if candidate_host == base_host:
        return True
    if candidate_host.endswith(f".{base_host}"):
        return True
    if base_host.endswith(f".{candidate_host}"):
        return True
    return False


def decode_html_bytes(raw: bytes, content_type: str | None = None) -> str:
    """Decode raw HTML bytes without silently dropping non-UTF-8 CJK characters."""
    if not raw:
        return ""

    if raw.startswith(b"\xef\xbb\xbf"):
        return raw.decode("utf-8-sig", errors="replace")
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16", errors="replace")

    candidate_encodings: list[str] = []
    if content_type:
        match = CONTENT_TYPE_CHARSET_PATTERN.search(content_type)
        if match:
            candidate_encodings.append(match.group(1).strip().lower())

    meta_match = META_CHARSET_PATTERN.search(raw[:4096])
    if meta_match:
        meta_charset = meta_match.group(1).decode("ascii", errors="ignore").strip().lower()
        if meta_charset and meta_charset not in candidate_encodings:
            candidate_encodings.append(meta_charset)

    for fallback in FALLBACK_HTML_ENCODINGS:
        if fallback not in candidate_encodings:
            candidate_encodings.append(fallback)

    # Map common legacy aliases to fuller supersets (e.g., gb2312 -> gb18030, shift_jis -> cp932).
    encoding_aliases = {
        "gb2312": "gb18030",
        "gbk": "gb18030",
        "shift_jis": "cp932",
        "shift-jis": "cp932",
        "sjis": "cp932",
        "euc-kr": "cp949",
        "ks_c_5601-1987": "cp949",
    }

    for encoding in candidate_encodings:
        resolved = encoding_aliases.get(encoding, encoding)
        try:
            return raw.decode(resolved, errors="strict")
        except (LookupError, UnicodeDecodeError):
            continue

    return raw.decode("utf-8", errors="replace")


def is_valid_iso_date(value: str) -> bool:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def normalize_date_for_db(value: str | None) -> tuple[str | None, str | None]:
    """Normalize a full or partial ISO date into a valid Postgres DATE string + precision."""
    if not isinstance(value, str):
        return None, None
    cleaned = value.strip()
    if not cleaned:
        return None, None

    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        try:
            parsed = datetime.strptime(cleaned, "%Y-%m-%d")
            return parsed.date().isoformat(), "day"
        except ValueError:
            return None, None

    if re.fullmatch(r"\d{4}-\d{2}", cleaned):
        try:
            parsed = datetime.strptime(f"{cleaned}-01", "%Y-%m-%d")
            return parsed.date().isoformat(), "month"
        except ValueError:
            return None, None

    if re.fullmatch(r"\d{4}", cleaned):
        try:
            parsed = datetime.strptime(f"{cleaned}-01-01", "%Y-%m-%d")
            return parsed.date().isoformat(), "year"
        except ValueError:
            return None, None

    # Fallback: ISO timestamp like 2025-03-14T12:00:00Z
    try:
        parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
        return parsed.date().isoformat(), "day"
    except ValueError:
        return None, None
