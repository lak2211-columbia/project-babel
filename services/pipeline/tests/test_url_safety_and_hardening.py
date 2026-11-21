import io
import json
from pathlib import Path
from urllib.error import HTTPError

import pytest

import observatory.audit as audit_module
import observatory.cli as cli_module
import observatory.discovery as discovery_module
import observatory.parser as parser_module
import observatory.retrieval as retrieval_module
import observatory.source_ops as source_ops_module
from observatory.browser_fetch import BrowserFetchResult
from observatory.source_registry import JurisdictionManifest, SeedDocument
from observatory.url_safety import (
    UnsafeURLError,
    decode_html_bytes,
    is_public_ip,
    read_bounded,
    same_host_family,
    validate_public_http_url,
)


def test_ssrf_url_validator_blocks_unsafe_schemes_and_private_ips(monkeypatch) -> None:
    for non_public in (
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "100.100.100.200",
        "::ffff:100.64.0.1",
        "::1",
    ):
        assert is_public_ip(non_public) is False
    assert is_public_ip("93.184.216.34") is True

    for bad_url in (
        "file:///etc/passwd",
        "ftp://example.com/file.pdf",
        "javascript:alert(1)",
        "http://localhost/admin",
        "http://127.0.0.1:8080/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.0.1/cgnat",
        "http://100.100.100.200/latest/meta-data/",
        "http://[::ffff:100.64.0.1]/mapped-cgnat",
        "http://2130706433/decimal-loopback",
        "http://0x7f000001/hex-loopback",
        "http://127.1/shorthand-loopback",
        "http://0177.0.0.1/octal-loopback",
        "http://0x7f.0.0.1/mixed-hex-loopback",
        "http://intranet/single-label",
        "http://10.0.0.5/secret",
        "http://192.168.1.1/router",
        "http://[::1]/loopback",
        "http://metadata.google.internal/computeMetadata/v1/",
    ):
        with pytest.raises(UnsafeURLError):
            validate_public_http_url(bad_url, resolve_dns=False)

    # DNS rebinding check
    monkeypatch.setattr(
        "observatory.url_safety.socket.getaddrinfo",
        lambda host, port, type=None: [(2, 1, 6, "", ("127.0.0.1", port))],
    )
    with pytest.raises(UnsafeURLError, match="non-public IP"):
        validate_public_http_url("https://rebind.example.com/doc", resolve_dns=True)

    # Public IP resolution passes
    monkeypatch.setattr(
        "observatory.url_safety.socket.getaddrinfo",
        lambda host, port, type=None: [(2, 1, 6, "", ("93.184.216.34", port))],
    )
    assert validate_public_http_url("https://example.com/doc", resolve_dns=True) == "https://example.com/doc"


def test_same_host_family_rejects_public_suffixes() -> None:
    assert same_host_family("https://www.meti.go.jp/a", "https://www.meti.go.jp/b") is True
    assert same_host_family("https://www.meti.go.jp/a", "https://go.jp/b") is False
    assert same_host_family("https://digital-strategy.ec.europa.eu/a", "https://ec.europa.eu/b") is True
    assert same_host_family("https://digital-strategy.ec.europa.eu/a", "https://europa.eu/b") is False
    assert same_host_family("https://example.com/a", "file:///etc/passwd") is False


def test_read_bounded_enforces_limit() -> None:
    class Stream:
        def __init__(self, data: bytes) -> None:
            self._buf = io.BytesIO(data)

        def read(self, size: int = -1) -> bytes:
            return self._buf.read(size)

    assert read_bounded(Stream(b"hello"), max_bytes=10) == b"hello"
    with pytest.raises(ValueError, match="exceeded maximum size"):
        read_bounded(Stream(b"0123456789abcdef"), max_bytes=8)


def test_decode_html_bytes_handles_cjk_encodings() -> None:
    zh_html = "<html><head><meta charset='gbk'></head><body>人工智能安全治理规范</body></html>"
    ja_html = "<html><head><meta charset='shift_jis'></head><body>人工知能ガイドライン</body></html>"
    ko_html = "<html><head><meta charset='euc-kr'></head><body>인공지능 기본법 시행령</body></html>"

    assert "人工智能安全治理规范" in decode_html_bytes(zh_html.encode("gb18030"))
    assert "人工知能ガイドライン" in decode_html_bytes(ja_html.encode("cp932"))
    assert "인공지능 기본법 시행령" in decode_html_bytes(ko_html.encode("cp949"))


def test_parser_is_offline_strips_boilerplate_dedupes_blocks_and_parses_cjk_dates(tmp_path: Path) -> None:
    assert not hasattr(parser_module, "urlopen")

    html = """
    <html lang="zh">
      <head><title>人工智能治理通知</title></head>
      <body>
        <div class="usa-banner">An official website of the United States government</div>
        <main>
          <p>发布时间：2026年04月10日</p>
          <p>Secure .gov websites use HTTPS</p>
          <p>首 页 时政要闻 网信政务 政策法规</p>
          <ul>
            <li><p>人工智能提供者应当开展安全评估。</p></li>
          </ul>
          <iframe src="file:///etc/passwd"></iframe>
        </main>
      </body>
    </html>
    """
    artifact = tmp_path / "source.html"
    artifact.write_bytes(html.encode("gb18030"))
    metadata = {
        "title": "人工智能治理通知",
        "canonical_url": "https://www.cac.gov.cn/notice.html",
        "language": "zh",
    }

    extracted_meta = parser_module.extract_html_source_metadata(artifact)
    assert extracted_meta["source_publication_date"] == "2026-04-10"
    assert parser_module._parse_date_value("令和6年4月19日") == "2024-04-19"

    parsed = parser_module.parse_html_artifact(artifact, metadata)
    assert "Secure .gov websites use HTTPS" not in parsed.plain_text
    assert "首 页 时政要闻" not in parsed.plain_text
    assert parsed.plain_text.count("人工智能提供者应当开展安全评估。") == 1

    # Stale cached linked PDF must not be reused when HTML points to a different URL.
    wrapper = tmp_path / "wrapper.html"
    wrapper.write_text(
        """
        <html lang="en"><body>
          <h1>Artificial Intelligence Safety Guidelines</h1>
          <div class="card">Artificial Intelligence Safety Guidelines English (PDF) <a download href="https://example.com/new.pdf">Download</a></div>
        </body></html>
        """,
        encoding="utf-8",
    )
    (tmp_path / "linked_source.pdf").write_bytes(b"%PDF-1.7 old")
    stale_parsed = parser_module.parse_html_artifact(
        wrapper,
        {
            "title": "Artificial Intelligence Safety Guidelines",
            "canonical_url": "https://example.com/wrapper",
            "linked_artifact_url": "https://example.com/old.pdf",
            "language": "en",
        },
    )
    assert "cached_linked_artifact_url_mismatch" in stale_parsed.warnings


def test_retrieval_rejects_browser_403_html_as_pdf_and_blocks_spa_overwrite(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def _make_manifest(*, doc_format: str, browser_required: bool, url: str) -> list[JurisdictionManifest]:
        return [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2.0",
                    "jurisdiction": "south_korea",
                    "description": "Fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "MSIT",
                            "canonical_url": "https://www.law.go.kr/",
                            "portal_kind": "registry",
                            "retrieval_strategy": "browser" if browser_required else "html",
                            "languages": ["ko"],
                            "priority": "high",
                            "coverage_notes": "Fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "kr_law",
                            "title": "AI Basic Act",
                            "issuing_body": "MSIT",
                            "canonical_url": url,
                            "browser_required": browser_required,
                            "browser_min_text_length": 500,
                            "document_type": "legislation",
                            "binding_strength": "binding_law",
                            "languages": ["ko"],
                            "document_format": doc_format,
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Fixture",
                        }
                    ],
                }
            )
        ]

    monkeypatch.setattr(retrieval_module, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval_module, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(retrieval_module, "ROOT", tmp_path)

    # 1. PDF magic-byte check rejects HTML error page at a .pdf URL
    assert retrieval_module._is_pdf_like_response("text/html", "https://example.com/law.pdf", b"<html>403</html>") is False
    assert retrieval_module._is_pdf_like_response("application/octet-stream", "https://example.com/file", b"%PDF-1.7 ok") is True

    # 2. Browser 403 must be rejected as http_error, NOT stored as downloaded_new
    monkeypatch.setattr(
        retrieval_module,
        "load_all_source_manifests",
        lambda: _make_manifest(doc_format="html", browser_required=True, url="https://www.law.go.kr/lsInfoP.do"),
    )
    monkeypatch.setattr(
        retrieval_module,
        "fetch_url_with_browser",
        lambda *args, **kwargs: BrowserFetchResult(
            payload=b"<html><body>Cloudflare 403 Forbidden</body></html>",
            content_type="text/html",
            status_code=403,
            resolved_url="https://www.law.go.kr/lsInfoP.do",
        ),
    )
    monkeypatch.setattr(
        retrieval_module,
        "urlopen",
        lambda request, timeout=20: (_ for _ in ()).throw(
            HTTPError(request.full_url, 403, "Forbidden", {}, io.BytesIO(b""))
        ),
    )
    res_403 = retrieval_module.fetch_seed_documents(use_browser=True, max_attempts=1)
    assert res_403[0]["status"] == "http_error"
    assert not (tmp_path / "raw" / "south_korea" / "kr_law" / "source.html").exists()

    # 3. SPA-overwrite guard refuses plain-HTTP shell overwriting browser-captured law
    full_law_html = ("<html><body>" + ("제1조 인공지능 기본법 조항 내용입니다. " * 200) + "</body></html>").encode("utf-8")
    monkeypatch.setattr(
        retrieval_module,
        "fetch_url_with_browser",
        lambda *args, **kwargs: BrowserFetchResult(
            payload=full_law_html,
            content_type="text/html; charset=utf-8",
            status_code=200,
            resolved_url="https://www.law.go.kr/lsInfoP.do",
        ),
    )
    first = retrieval_module.fetch_seed_documents(use_browser=True)
    assert first[0]["status"] == "downloaded_new"

    class FakeShellResp:
        status = 200
        headers = {"Content-Type": "text/html; charset=utf-8"}

        def __init__(self) -> None:
            self._buf = io.BytesIO(b"<html><body><span>Loading...</span></body></html>")

        def read(self, n=-1):
            return self._buf.read(n)

        def geturl(self):
            return "https://www.law.go.kr/lsInfoP.do"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(retrieval_module, "urlopen", lambda request, timeout=20: FakeShellResp())
    blocked = retrieval_module.fetch_seed_documents(refresh=True, use_browser=False)
    assert blocked[0]["status"] == "blocked_spa_overwrite"
    assert (tmp_path / "raw" / "south_korea" / "kr_law" / "source.html").read_bytes() == full_law_html


def test_spa_overwrite_guard_blocks_chrome_heavy_shell_on_initial_fetch() -> None:
    nav_chrome = "<nav>" + ("국가법령정보센터 메뉴 항목 링크 안내 " * 120) + "</nav>"
    doc_with_selector = SeedDocument.model_validate(
        {
            "id": "kr_spa_selector",
            "title": "KR SPA Selector",
            "issuing_body": "MSIT",
            "canonical_url": "https://www.law.go.kr/lsInfoP.do",
            "browser_required": True,
            "browser_wait_for_selector": "#bodyContent",
            "browser_min_text_length": 300,
            "document_type": "legislation",
            "binding_strength": "binding_law",
            "languages": ["ko"],
            "document_format": "html",
            "source_portal_ids": ["portal"],
            "priority": "high",
            "relevance_notes": "Fixture",
        }
    )

    # Selector present but empty despite >1,500 chars of surrounding nav chrome
    empty_selector_shell = (
        f"<html><body>{nav_chrome}<div id='bodyContent'></div></body></html>"
    ).encode("utf-8")
    reason_empty = retrieval_module._is_blocked_spa_overwrite(
        document=doc_with_selector,
        previous_metadata={},
        payload=empty_selector_shell,
        content_type="text/html; charset=utf-8",
        transport="http",
    )
    assert reason_empty is not None
    assert "#bodyContent" in reason_empty

    # Selector completely absent
    missing_selector_shell = (
        f"<html><body>{nav_chrome}<main>Loading...</main></body></html>"
    ).encode("utf-8")
    reason_missing = retrieval_module._is_blocked_spa_overwrite(
        document=doc_with_selector,
        previous_metadata={},
        payload=missing_selector_shell,
        content_type="text/html; charset=utf-8",
        transport="http",
    )
    assert reason_missing is not None
    assert "missing required selector" in reason_missing

    # Whole-page fallback strips header/nav/footer/aside chrome
    doc_without_selector = doc_with_selector.model_copy(update={"browser_wait_for_selector": None})
    chrome_only_shell = (
        f"<html><body><header>{nav_chrome}</header><footer>{nav_chrome}</footer><main>Loading...</main></body></html>"
    ).encode("utf-8")
    reason_chrome_only = retrieval_module._is_blocked_spa_overwrite(
        document=doc_without_selector,
        previous_metadata={},
        payload=chrome_only_shell,
        content_type="text/html; charset=utf-8",
        transport="http",
    )
    assert reason_chrome_only is not None
    assert "visible chars" in reason_chrome_only


def test_retrieval_supports_conditional_304_not_modified(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "united_states",
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
                    "issuing_body": "NIST",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": "us_doc",
                    "title": "US Doc",
                    "issuing_body": "NIST",
                    "canonical_url": "https://example.com/us-doc",
                    "document_type": "standards_guideline",
                    "binding_strength": "standards_guideline",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    monkeypatch.setattr(retrieval_module, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval_module, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(retrieval_module, "ROOT", tmp_path)
    monkeypatch.setattr(retrieval_module, "load_all_source_manifests", lambda: [manifest])

    class FirstResp:
        status = 200
        headers = {"Content-Type": "text/html", "ETag": '"v1"'}

        def __init__(self) -> None:
            self._buf = io.BytesIO(b"<html><body><h1>AI</h1></body></html>")

        def read(self, n=-1):
            return self._buf.read(n)

        def geturl(self):
            return "https://example.com/us-doc"

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(retrieval_module, "urlopen", lambda req, timeout=20: FirstResp())
    first = retrieval_module.fetch_seed_documents()
    assert first[0]["status"] == "downloaded_new"

    seen_headers: dict[str, str] = {}

    def fake_304(req, timeout=20):
        seen_headers.update({k.lower(): v for k, v in req.header_items()})
        raise HTTPError(req.full_url, 304, "Not Modified", {}, io.BytesIO(b""))

    monkeypatch.setattr(retrieval_module, "urlopen", fake_304)
    second = retrieval_module.fetch_seed_documents(refresh=True)
    assert second[0]["status"] == "not_modified"
    assert second[0]["artifact_state"] == "unchanged"
    assert seen_headers.get("if-none-match") == '"v1"'


def test_discovery_recurses_into_sitemapindex(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "united_states",
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
                    "issuing_body": "NIST",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "discovery_targets": [
                        {
                            "url": "https://example.com/sitemap_index.xml",
                            "kind": "sitemap",
                            "include_url_patterns": ["/ai/"],
                        }
                    ],
                }
            ],
            "seed_documents": [
                {
                    "id": "seed",
                    "title": "Seed",
                    "issuing_body": "NIST",
                    "canonical_url": "https://example.com/seed",
                    "document_type": "standards_guideline",
                    "binding_strength": "standards_guideline",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )

    index_xml = (
        b'<?xml version="1.0" encoding="UTF-8"?>'
        b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        b"<sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>"
        b"</sitemapindex>"
    )
    child_xml = (
        b'<?xml version="1.0" encoding="UTF-8"?>'
        b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        b"<url><loc>https://example.com/ai/framework</loc><lastmod>2026-06-01</lastmod></url>"
        b"</urlset>"
    )

    class FakeXmlResp:
        def __init__(self, body: bytes, url: str) -> None:
            self._buf = io.BytesIO(body)
            self._url = url

        def read(self, n=-1):
            return self._buf.read(n)

        def geturl(self):
            return self._url

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(discovery_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(discovery_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(
        discovery_module,
        "urlopen",
        lambda req, timeout=45: FakeXmlResp(
            index_xml if "sitemap_index" in req.full_url else child_xml,
            req.full_url,
        ),
    )

    assert "project-babel.com" in discovery_module._request_headers()["User-Agent"]
    results = discovery_module.discover_source_candidates(refresh=True)
    assert results[0]["status"] == "discovered"
    assert results[0]["candidate_count"] == "1"
    payload = json.loads((tmp_path / "discovery" / "united_states" / "p.json").read_text(encoding="utf-8"))
    assert payload["candidates"][0]["url"] == "https://example.com/ai/framework"


def test_source_ops_word_boundaries_and_super_intelligence() -> None:
    # "detail" / "main" must NOT trigger frontier_gpai via substring "ai"
    domains = source_ops_module.infer_policy_domains(
        {"title": "Main Contact Details", "url": "https://example.com/main/detail"},
        portal_tags=[],
    )
    assert "frontier_gpai" not in domains

    # "impact" / "action" must NOT classify as binding_law via substring "act"
    doc_type, binding, _tier = source_ops_module.classify_candidate(
        {"title": "AI Action Plan and Impact Strategy", "url": "https://example.com/action-plan"},
        portal_tags=[],
        source_role="supporting_context",
    )
    assert binding != "binding_law"
    assert doc_type != "legislation"

    # EO 14434 "Super Intelligence" terminology is recognized as AI-relevant
    score, reasons = source_ops_module.score_candidate(
        {"title": "Inaugurating the Era of Super Intelligence", "url": "https://federalregister.gov/eo-14434"},
        source_role="primary_text",
    )
    assert score > 0
    assert "AI-relevant title or URL" in reasons


def test_audit_cjk_length_and_real_defect_detectors(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2.0",
            "jurisdiction": "china",
            "description": "Fixture",
            "source_portals": [
                {
                    "id": "p",
                    "name": "P",
                    "issuing_body": "CAC",
                    "canonical_url": "https://example.com",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["zh"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                }
            ],
            "seed_documents": [
                {
                    "id": "cn_cjk_law",
                    "title": "人工智能安全管理暂行办法",
                    "issuing_body": "CAC",
                    "canonical_url": "https://example.com/cn-law",
                    "document_type": "legislation",
                    "binding_strength": "binding_law",
                    "source_tier": "statutory_rule",
                    "publication_date": "2025-05-01",
                    "languages": ["zh"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                },
                {
                    "id": "cn_offtopic_doc",
                    "title": "Copyright Royalty Videoconference Inspection Notice",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/offtopic",
                    "document_type": "regulatory_guidance",
                    "binding_strength": "regulatory_guidance",
                    "source_tier": "regulatory_guidance",
                    "publication_date": "2026-03-25",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "medium",
                    "relevance_notes": "Fixture",
                },
                {
                    "id": "cn_spa_stub",
                    "title": "AI Basic Act",
                    "issuing_body": "Agency",
                    "canonical_url": "https://www.law.go.kr/lsInfoP.do",
                    "browser_required": True,
                    "document_type": "legislation",
                    "binding_strength": "binding_law",
                    "source_tier": "statutory_rule",
                    "publication_date": "2025-01-21",
                    "languages": ["ko"],
                    "document_format": "html",
                    "source_portal_ids": ["p"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                },
            ],
        }
    )

    monkeypatch.setattr(audit_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(audit_module, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(audit_module, "PARSED_DIR", tmp_path / "parsed")
    monkeypatch.setattr(audit_module, "ANALYSIS_DIR", tmp_path / "analysis")

    for doc_id, text, sha in (
        ("cn_cjk_law", "人工智能服务提供者应当依法开展安全评估和算法备案，维护国家安全和社会公共利益。" * 45, "sha-unique-1"),
        ("cn_offtopic_doc", "Royalty collection bodies may conduct remote videoconference board inspections under the revised copyright procedure. " * 6, "sha-dup"),
        ("cn_spa_stub", "국가법령정보센터 로딩중", "sha-dup"),
    ):
        (tmp_path / "parsed" / "china" / doc_id).mkdir(parents=True)
        (tmp_path / "raw" / "china" / doc_id).mkdir(parents=True)
        (tmp_path / "parsed" / "china" / doc_id / "normalized.json").write_text(
            json.dumps({"plain_text": text}, ensure_ascii=False),
            encoding="utf-8",
        )
        (tmp_path / "raw" / "china" / doc_id / "metadata.json").write_text(
            json.dumps({"sha256": sha, "publication_date": "2025-05-01"}, ensure_ascii=False),
            encoding="utf-8",
        )

    audit = audit_module.build_source_quality_audit()
    docs = {item["document_id"]: item for item in audit["jurisdictions"][0]["documents"]}

    # Dense Chinese text with zero spaces is NOT penalized as thin
    assert docs["cn_cjk_law"]["parsed_word_count"] >= 400
    assert "thin extracted text" not in docs["cn_cjk_law"]["findings"]
    assert docs["cn_cjk_law"]["action"] == "keep_core"

    # Off-topic 0-AI doc is flagged + duplicate SHA256 detected
    assert any("off-topic" in f for f in docs["cn_offtopic_doc"]["fidelity_findings"])
    assert any("duplicate raw artifact SHA-256" in f for f in docs["cn_offtopic_doc"]["metadata_issues"])

    # SPA stub on law.go.kr is caught
    assert docs["cn_spa_stub"]["source_link_status"] == "spa_shell_capture"
    assert docs["cn_spa_stub"]["source_link_action"] == "refetch_with_browser"

    # Mojibake helper catches Shift-JIS/CID gibberish
    assert audit_module._looks_garbled_mojibake("lÔªAIð¹ïÆµÄg¢±È·±ÆÉæÁÄAlÔÌlXÈ/'ðÆ" * 4) is True
    assert audit_module._looks_garbled_mojibake("The European Union AI Act establishes harmonized rules.") is False


def test_seed_document_rejects_impossible_calendar_dates() -> None:
    with pytest.raises(ValueError, match="valid calendar ISO dates"):
        SeedDocument.model_validate(
            {
                "id": "bad_date",
                "title": "Bad Date",
                "issuing_body": "Agency",
                "canonical_url": "https://example.com/bad",
                "document_type": "legislation",
                "binding_strength": "binding_law",
                "publication_date": "2025-99-99",
                "languages": ["en"],
                "document_format": "html",
                "source_portal_ids": ["p"],
                "priority": "high",
                "relevance_notes": "Test",
            }
        )


def test_cli_export_schemas_and_strict_flag_rejection(tmp_path: Path) -> None:
    out_dir = tmp_path / "schemas"
    cli_module.app(["export-schemas", str(out_dir)])
    for filename in (
        "policy-extraction.schema.json",
        "risk-framing.schema.json",
        "document-analysis.schema.json",
        "jurisdiction-analysis.schema.json",
    ):
        schema_data = json.loads((out_dir / filename).read_text(encoding="utf-8"))
        assert schema_data["$schema"] == "https://json-schema.org/draft/2020-12/schema"

    with pytest.raises(SystemExit, match="unknown analyze-jurisdictions option"):
        cli_module.app(["analyze-jurisdictions", "--bogus-flag"])
