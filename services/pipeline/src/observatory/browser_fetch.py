from __future__ import annotations

from dataclasses import dataclass


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


def fetch_url_with_browser(
    url: str,
    *,
    wait_for_selector: str | None = None,
    min_text_length: int | None = None,
    click_selectors: list[str] | None = None,
    timeout_seconds: int = 45,
    user_agent: str | None = None,
) -> BrowserFetchResult:
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserUnavailableError(
            "Playwright is not installed. Run `pip install -e services/pipeline[dev]` and "
            "`python -m playwright install chromium` in services/pipeline/.venv."
        ) from exc

    timeout_ms = max(timeout_seconds, 1) * 1000
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                locale="en-US",
                user_agent=user_agent,
            )
            page = context.new_page()
            response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
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

            payload = page.content().encode("utf-8")
            content_type = response.headers.get("content-type") if response is not None else "text/html; charset=utf-8"
            status_code = response.status if response is not None else 200
            resolved_url = page.url
            context.close()
            browser.close()
    except PlaywrightTimeoutError as exc:
        raise BrowserFetchError(f"browser fetch timed out for {url}") from exc
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


def fetch_binary_url_with_browser(
    url: str,
    *,
    timeout_seconds: int = 45,
    user_agent: str | None = None,
) -> BrowserFetchResult:
    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise BrowserUnavailableError(
            "Playwright is not installed. Run `pip install -e services/pipeline[dev]` and "
            "`python -m playwright install chromium` in services/pipeline/.venv."
        ) from exc

    timeout_ms = max(timeout_seconds, 1) * 1000
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                locale="en-US",
                user_agent=user_agent,
            )
            response = context.request.get(
                url,
                timeout=timeout_ms,
                fail_on_status_code=False,
            )
            payload = response.body()
            content_type = response.headers.get("content-type")
            status_code = response.status
            resolved_url = response.url
            context.close()
            browser.close()
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
