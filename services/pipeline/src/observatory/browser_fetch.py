from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
from urllib.parse import urljoin

from observatory.url_safety import UnsafeURLError, validate_public_http_url


LOCALE_BY_LANGUAGE = {
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh": "zh-CN",
    "en": "en-US",
}
MAX_BROWSER_BINARY_REDIRECTS = 5


class BrowserFetchError(RuntimeError):
    """Raised when a rendered browser fetch cannot be completed."""


class BrowserUnavailableError(BrowserFetchError):
    """Raised when Playwright or a browser binary is unavailable."""


@dataclass(slots=True)
class BrowserFetchResult:
    payload: bytes
    content_type: str | None
    status_code: int
    resolved_url: str


def locale_for_languages(languages: Sequence[str] | None) -> str:
    if languages:
        primary = languages[0].strip().lower().split("-", 1)[0]
        if primary in LOCALE_BY_LANGUAGE:
            return LOCALE_BY_LANGUAGE[primary]
    return "en-US"


class BrowserSession:
    """Reusable Playwright Chromium session for batch browser-backed fetches."""

    def __init__(self, *, user_agent: str | None = None) -> None:
        self.user_agent = user_agent
        self._playwright_cm = None
        self._playwright = None
        self._browser = None

    def __enter__(self) -> "BrowserSession":
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise BrowserUnavailableError(
                "Playwright is not installed. Run `pip install -e 'services/pipeline[dev]'` and "
                "`python -m playwright install chromium`."
            ) from exc

        self._playwright_cm = sync_playwright()
        self._playwright = self._playwright_cm.__enter__()
        self._browser = self._playwright.chromium.launch(headless=True)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        try:
            if self._browser is not None:
                self._browser.close()
        finally:
            self._browser = None
            if self._playwright_cm is not None:
                self._playwright_cm.__exit__(exc_type, exc_val, exc_tb)
                self._playwright_cm = None
                self._playwright = None

    def fetch_html(
        self,
        url: str,
        *,
        wait_for_selector: str | None = None,
        min_text_length: int | None = None,
        click_selectors: list[str] | None = None,
        timeout_seconds: int = 45,
        locale: str = "en-US",
        user_agent: str | None = None,
        resolve_dns: bool = True,
    ) -> BrowserFetchResult:
        if self._browser is None:
            raise BrowserFetchError("BrowserSession must be entered as a context manager")
        return _fetch_html_in_browser(
            self._browser,
            url,
            wait_for_selector=wait_for_selector,
            min_text_length=min_text_length,
            click_selectors=click_selectors,
            timeout_seconds=timeout_seconds,
            locale=locale,
            user_agent=user_agent or self.user_agent,
            resolve_dns=resolve_dns,
        )


def _install_ssrf_route_guard(
    context,
    *,
    resolve_dns: bool,
) -> tuple[list[str], list[str]]:
    """Validate every Playwright sub-request and navigation target against SSRF rules."""
    blocked_urls: list[str] = []
    blocked_navigation_urls: list[str] = []

    def _handle_route(route) -> None:
        request_url = route.request.url
        try:
            validate_public_http_url(request_url, resolve_dns=resolve_dns)
        except UnsafeURLError:
            blocked_urls.append(request_url)
            if route.request.is_navigation_request():
                blocked_navigation_urls.append(request_url)
            route.abort("blockedbyclient")
            return
        route.continue_()

    context.route("**/*", _handle_route)
    return blocked_urls, blocked_navigation_urls


def _fetch_html_in_browser(
    browser,
    url: str,
    *,
    wait_for_selector: str | None,
    min_text_length: int | None,
    click_selectors: list[str] | None,
    timeout_seconds: int,
    locale: str,
    user_agent: str | None,
    resolve_dns: bool,
) -> BrowserFetchResult:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

    try:
        validate_public_http_url(url, resolve_dns=resolve_dns)
    except UnsafeURLError as exc:
        raise BrowserFetchError(f"blocked unsafe browser URL: {exc}") from exc

    timeout_ms = max(timeout_seconds, 1) * 1000
    context = None
    blocked_navigation_urls: list[str] = []
    try:
        context = browser.new_context(
            locale=locale,
            user_agent=user_agent,
        )
        _blocked_urls, blocked_navigation_urls = _install_ssrf_route_guard(
            context,
            resolve_dns=resolve_dns,
        )
        page = context.new_page()
        response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        if blocked_navigation_urls:
            raise BrowserFetchError(f"blocked unsafe browser navigation URL: {blocked_navigation_urls[0]}")
        resolved_url = page.url
        try:
            validate_public_http_url(resolved_url, resolve_dns=resolve_dns)
        except UnsafeURLError as exc:
            raise BrowserFetchError(f"blocked unsafe redirect URL: {exc}") from exc

        for selector in click_selectors or []:
            locator = page.locator(selector).first
            if locator.count() == 0:
                continue
            locator.click(timeout=min(timeout_ms, 5000))
        if wait_for_selector is not None:
            page.wait_for_selector(wait_for_selector, timeout=timeout_ms)
            if min_text_length is not None:
                page.wait_for_function(
                    """
                    ([selector, minimum]) => {
                      const element = document.querySelector(selector);
                      if (!element) return false;
                      return (element.innerText || element.textContent || "").trim().length >= minimum;
                    }
                    """,
                    arg=[wait_for_selector, min_text_length],
                    timeout=timeout_ms,
                )
        else:
            try:
                page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 10000))
            except PlaywrightTimeoutError:
                pass

        if blocked_navigation_urls:
            raise BrowserFetchError(f"blocked unsafe browser navigation URL: {blocked_navigation_urls[0]}")
        payload = page.content().encode("utf-8")
        content_type = response.headers.get("content-type") if response is not None else "text/html; charset=utf-8"
        status_code = response.status if response is not None else 200
        resolved_url = page.url
        try:
            validate_public_http_url(resolved_url, resolve_dns=resolve_dns)
        except UnsafeURLError as exc:
            raise BrowserFetchError(f"blocked unsafe redirect URL: {exc}") from exc
    except BrowserFetchError:
        raise
    except PlaywrightTimeoutError as exc:
        if blocked_navigation_urls:
            raise BrowserFetchError(
                f"blocked unsafe browser navigation URL: {blocked_navigation_urls[0]}"
            ) from exc
        raise BrowserFetchError(f"browser fetch timed out for {url}") from exc
    except PlaywrightError as exc:
        if blocked_navigation_urls:
            raise BrowserFetchError(
                f"blocked unsafe browser navigation URL: {blocked_navigation_urls[0]}"
            ) from exc
        message = str(exc)
        lowered = message.lower()
        if "executable doesn't exist" in lowered or "browser has been closed" in lowered:
            raise BrowserUnavailableError(
                "Chromium is not installed for Playwright. Run `python -m playwright install chromium`."
            ) from exc
        raise BrowserFetchError(message) from exc
    finally:
        if context is not None:
            context.close()

    return BrowserFetchResult(
        payload=payload,
        content_type=content_type,
        status_code=status_code,
        resolved_url=resolved_url,
    )


def fetch_url_with_browser(
    url: str,
    *,
    wait_for_selector: str | None = None,
    min_text_length: int | None = None,
    click_selectors: list[str] | None = None,
    timeout_seconds: int = 45,
    user_agent: str | None = None,
    locale: str = "en-US",
    resolve_dns: bool = True,
) -> BrowserFetchResult:
    try:
        validate_public_http_url(url, resolve_dns=resolve_dns)
    except UnsafeURLError as exc:
        raise BrowserFetchError(f"blocked unsafe browser URL: {exc}") from exc

    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserUnavailableError(
            "Playwright is not installed. Run `pip install -e 'services/pipeline[dev]'` and "
            "`python -m playwright install chromium`."
        ) from exc

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                return _fetch_html_in_browser(
                    browser,
                    url,
                    wait_for_selector=wait_for_selector,
                    min_text_length=min_text_length,
                    click_selectors=click_selectors,
                    timeout_seconds=timeout_seconds,
                    locale=locale,
                    user_agent=user_agent,
                    resolve_dns=resolve_dns,
                )
            finally:
                browser.close()
    except BrowserFetchError:
        raise
    except PlaywrightError as exc:
        message = str(exc)
        lowered = message.lower()
        if "executable doesn't exist" in lowered or "browser has been closed" in lowered:
            raise BrowserUnavailableError(
                "Chromium is not installed for Playwright. Run `python -m playwright install chromium`."
            ) from exc
        raise BrowserFetchError(message) from exc


def fetch_binary_url_with_browser(
    url: str,
    *,
    timeout_seconds: int = 45,
    user_agent: str | None = None,
    locale: str = "en-US",
    resolve_dns: bool = True,
) -> BrowserFetchResult:
    try:
        validate_public_http_url(url, resolve_dns=resolve_dns)
    except UnsafeURLError as exc:
        raise BrowserFetchError(f"blocked unsafe browser URL: {exc}") from exc

    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserUnavailableError(
            "Playwright is not installed. Run `pip install -e 'services/pipeline[dev]'` and "
            "`python -m playwright install chromium`."
        ) from exc

    timeout_ms = max(timeout_seconds, 1) * 1000
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = None
            try:
                context = browser.new_context(
                    locale=locale,
                    user_agent=user_agent,
                )
                current_url = url
                response = None
                for _hop in range(MAX_BROWSER_BINARY_REDIRECTS + 1):
                    try:
                        validate_public_http_url(current_url, resolve_dns=resolve_dns)
                    except UnsafeURLError as exc:
                        raise BrowserFetchError(f"blocked unsafe redirect URL: {exc}") from exc
                    response = context.request.get(
                        current_url,
                        timeout=timeout_ms,
                        fail_on_status_code=False,
                        max_redirects=0,
                    )
                    location = response.headers.get("location")
                    if response.status in {301, 302, 303, 307, 308} and location:
                        current_url = urljoin(current_url, location)
                        continue
                    break
                else:
                    raise BrowserFetchError(f"too many redirects for {url}")

                assert response is not None
                resolved_url = response.url or current_url
                try:
                    validate_public_http_url(resolved_url, resolve_dns=resolve_dns)
                except UnsafeURLError as exc:
                    raise BrowserFetchError(f"blocked unsafe redirect URL: {exc}") from exc
                payload = response.body()
                content_type = response.headers.get("content-type")
                status_code = response.status
            finally:
                if context is not None:
                    context.close()
                browser.close()
    except BrowserFetchError:
        raise
    except PlaywrightTimeoutError as exc:
        raise BrowserFetchError(f"browser request timed out for {url}") from exc
    except PlaywrightError as exc:
        message = str(exc)
        lowered = message.lower()
        if "executable doesn't exist" in lowered or "browser has been closed" in lowered:
            raise BrowserUnavailableError(
                "Chromium is not installed for Playwright. Run `python -m playwright install chromium`."
            ) from exc
        raise BrowserFetchError(message) from exc

    return BrowserFetchResult(
        payload=payload,
        content_type=content_type,
        status_code=status_code,
        resolved_url=resolved_url,
    )
