from __future__ import annotations

import json
from pathlib import Path
from urllib.error import URLError

from observatory import retrieval
from observatory.browser_fetch import BrowserFetchResult
from observatory.source_registry import JurisdictionManifest


class FakeHeaders(dict):
    def get(self, key: str, default: str | None = None) -> str | None:
        return super().get(key, default)


class FakeResponse:
    def __init__(
        self,
        payload: bytes,
        *,
        url: str | None = None,
        content_type: str = "text/html; charset=utf-8",
        status: int = 200,
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> None:
        self._payload = payload
        self._url = url
        self.status = status
        self.headers = FakeHeaders(
            {
                "Content-Type": content_type,
                "ETag": etag,
                "Last-Modified": last_modified,
            }
        )

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self._payload

    def geturl(self) -> str:
        if self._url is None:
            raise AttributeError("response URL not configured")
        return self._url


def _manifest() -> list[JurisdictionManifest]:
    return [
        JurisdictionManifest.model_validate(
            {
                "manifest_version": "2026-04-14",
                "jurisdiction": "united_states",
                "description": "Test fixture",
                "source_portals": [
                    {
                        "id": "portal",
                        "name": "Portal",
                        "issuing_body": "Test Agency",
                        "canonical_url": "https://example.com",
                        "portal_kind": "portal",
                        "retrieval_strategy": "html",
                        "languages": ["en"],
                        "priority": "high",
                        "coverage_notes": "Test fixture",
                    }
                ],
                "seed_documents": [
                    {
                        "id": "test_document",
                        "title": "Test Document",
                        "issuing_body": "Test Agency",
                        "canonical_url": "https://example.com/document",
                        "document_type": "strategy_paper",
                        "binding_strength": "strategy_statement",
                        "publication_date": "2026-01-01",
                        "languages": ["en"],
                        "document_format": "html",
                        "source_portal_ids": ["portal"],
                        "priority": "high",
                        "relevance_notes": "Test fixture",
                    }
                ],
            }
        )
    ]


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_fetch_seed_documents_writes_metadata_and_retrieval_log(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(retrieval, "load_all_source_manifests", _manifest)
    monkeypatch.setattr(
        retrieval,
        "urlopen",
        lambda request, timeout=20: FakeResponse(
            b"<html><body><h1>AI Rule</h1></body></html>",
            etag='"fixture-etag"',
            last_modified="Tue, 14 Apr 2026 12:00:00 GMT",
        ),
    )

    results = retrieval.fetch_seed_documents()

    assert results == [
        {
            "jurisdiction": "united_states",
            "document_id": "test_document",
            "status": "downloaded_new",
            "attempts": "1",
            "artifact_state": "new",
            "status_code": "200",
        }
    ]

    metadata = _read_json(
        tmp_path / "raw" / "united_states" / "test_document" / "metadata.json"
    )
    assert metadata["artifact_state"] == "new"
    assert metadata["content_bytes"] == 42
    assert metadata["sha256"]
    assert str(metadata["retrieval_log_path"]).endswith("retrieval/united_states/test_document.json")

    retrieval_log = _read_json(tmp_path / "retrieval" / "united_states" / "test_document.json")
    assert len(retrieval_log["attempts"]) == 1
    assert retrieval_log["attempts"][0]["status"] == "downloaded_new"


def test_fetch_seed_documents_refresh_marks_unchanged_content(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(retrieval, "load_all_source_manifests", _manifest)
    monkeypatch.setattr(
        retrieval,
        "urlopen",
        lambda request, timeout=20: FakeResponse(b"<html><body><h1>AI Rule</h1></body></html>"),
    )

    first = retrieval.fetch_seed_documents()
    second = retrieval.fetch_seed_documents(refresh=True)

    assert first[0]["status"] == "downloaded_new"
    assert second[0]["status"] == "downloaded_unchanged"
    assert second[0]["artifact_state"] == "unchanged"

    metadata = _read_json(
        tmp_path / "raw" / "united_states" / "test_document" / "metadata.json"
    )
    assert metadata["artifact_state"] == "unchanged"
    assert metadata["retrieval_count"] == 2

    retrieval_log = _read_json(tmp_path / "retrieval" / "united_states" / "test_document.json")
    assert [attempt["status"] for attempt in retrieval_log["attempts"]] == [
        "downloaded_new",
        "downloaded_unchanged",
    ]


def test_fetch_seed_documents_retries_transient_url_errors(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(retrieval, "load_all_source_manifests", _manifest)
    monkeypatch.setattr(retrieval.time, "sleep", lambda seconds: None)

    attempts = iter(
        [
            URLError("temporary outage"),
            FakeResponse(b"<html><body><h1>Recovered</h1></body></html>"),
        ]
    )

    def fake_urlopen(request, timeout=20):
        response = next(attempts)
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(retrieval, "urlopen", fake_urlopen)

    results = retrieval.fetch_seed_documents(max_attempts=2)

    assert results[0]["status"] == "downloaded_new"
    assert results[0]["attempts"] == "2"

    retrieval_log = _read_json(tmp_path / "retrieval" / "united_states" / "test_document.json")
    assert [attempt["status"] for attempt in retrieval_log["attempts"]] == [
        "url_error",
        "downloaded_new",
    ]


def test_fetch_seed_documents_uses_eurlex_alternate_fetch_url(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "european_union",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "European Union",
                            "canonical_url": "https://eur-lex.europa.eu/",
                            "portal_kind": "library",
                            "retrieval_strategy": "mixed",
                            "languages": ["en"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "eu_ai_act",
                            "title": "AI Act",
                            "issuing_body": "European Union",
                            "canonical_url": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng",
                            "document_type": "legislation",
                            "binding_strength": "binding_law",
                            "publication_date": "2024-07-12",
                            "languages": ["en"],
                            "document_format": "html",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    requested_urls: list[str] = []

    def fake_urlopen(request, timeout=20):
        requested_urls.append(request.full_url)
        return FakeResponse(b"<html><body><h1>AI Act</h1></body></html>")

    monkeypatch.setattr(retrieval, "urlopen", fake_urlopen)

    results = retrieval.fetch_seed_documents()

    assert results[0]["status"] == "downloaded_new"
    assert requested_urls == [
        "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1689"
    ]


def test_linked_pdf_candidates_extracts_pipc_onclick_downloads() -> None:
    payload = """
    <html>
      <body>
        <div class="boardViewArea">
          <a href="#LINK" onclick="javascript:fn_egov_downFile('FILE_000000000558005','0','pdf')">다운로드</a>
        </div>
      </body>
    </html>
    """.encode("utf-8")

    candidates = retrieval._linked_pdf_candidates(
        payload,
        base_url="https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&nttId=11024",
    )

    assert candidates == [
        "https://www.pipc.go.kr/np/cmm/fms/FileDown.do?atchFileId=FILE_000000000558005&fileSn=0&fileExtsn=pdf&cnvCnt="
    ]


def test_linked_pdf_candidates_ignores_non_pdf_msit_hwpx_downloads() -> None:
    payload = """
    <html>
      <body>
        <a href="javascript:void(0);" onclick="fn_download('51534', '4', 'hwpx');">다운로드</a>
      </body>
    </html>
    """.encode("utf-8")

    candidates = retrieval._linked_pdf_candidates(
        payload,
        base_url="https://www.msit.go.kr/bbs/view.do?bbsSeqNo=84&mId=109&mPid=103&nttSeqNo=3186315&sCode=user",
    )

    assert candidates == []


def test_fetch_seed_documents_prefers_manifest_retrieval_urls(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "united_states",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com",
                            "portal_kind": "portal",
                            "retrieval_strategy": "html",
                            "languages": ["en"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "test_document",
                            "title": "Test Document",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com/document",
                            "retrieval_urls": ["https://downloads.example.com/document"],
                            "document_type": "strategy_paper",
                            "binding_strength": "strategy_statement",
                            "publication_date": "2026-01-01",
                            "languages": ["en"],
                            "document_format": "html",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    requested_urls: list[str] = []

    def fake_urlopen(request, timeout=20):
        requested_urls.append(request.full_url)
        return FakeResponse(
            b"<html><body><h1>Mirror Copy</h1></body></html>",
            url=request.full_url,
        )

    monkeypatch.setattr(retrieval, "urlopen", fake_urlopen)

    results = retrieval.fetch_seed_documents()

    assert results[0]["status"] == "downloaded_new"
    assert requested_urls == ["https://downloads.example.com/document"]


def test_fetch_seed_documents_discovers_pdf_from_html_landing_page(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "japan",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "METI",
                            "canonical_url": "https://www.meti.go.jp/",
                            "portal_kind": "library",
                            "retrieval_strategy": "mixed",
                            "languages": ["en"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "test_pdf_document",
                            "title": "Test PDF",
                            "issuing_body": "METI",
                            "canonical_url": "https://www.meti.go.jp/files/test.pdf",
                            "retrieval_urls": [
                                "https://www.meti.go.jp/reports/test-report.html"
                            ],
                            "document_type": "standards_guideline",
                            "binding_strength": "standards_guideline",
                            "publication_date": "2026-01-01",
                            "languages": ["en"],
                            "document_format": "pdf",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    requested_urls: list[str] = []

    def fake_urlopen(request, timeout=20):
        requested_urls.append(request.full_url)
        if request.full_url == "https://www.meti.go.jp/reports/test-report.html":
            return FakeResponse(
                (
                    b"<html><body>"
                    b'<a href="/files/test.pdf">Download PDF</a>'
                    b"</body></html>"
                ),
                url=request.full_url,
            )
        return FakeResponse(
            b"%PDF-1.7 test fixture",
            content_type="application/pdf",
            url=request.full_url,
        )

    monkeypatch.setattr(retrieval, "urlopen", fake_urlopen)

    results = retrieval.fetch_seed_documents()

    assert results[0] == {
        "jurisdiction": "japan",
        "document_id": "test_pdf_document",
        "status": "downloaded_new",
        "attempts": "2",
        "artifact_state": "new",
        "status_code": "200",
    }
    assert requested_urls == [
        "https://www.meti.go.jp/reports/test-report.html",
        "https://www.meti.go.jp/files/test.pdf",
    ]

    metadata = _read_json(tmp_path / "raw" / "japan" / "test_pdf_document" / "metadata.json")
    assert metadata["fetch_url"] == "https://www.meti.go.jp/files/test.pdf"
    assert metadata["retrieval_urls"] == ["https://www.meti.go.jp/reports/test-report.html"]

    retrieval_log = _read_json(tmp_path / "retrieval" / "japan" / "test_pdf_document.json")
    assert [attempt["status"] for attempt in retrieval_log["attempts"]] == [
        "discovered_linked_artifact",
        "downloaded_new",
    ]


def test_fetch_seed_documents_prefers_manifest_canonical_pdf_when_landing_page_lists_multiple_pdfs(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "japan",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "MHLW",
                            "canonical_url": "https://example.com/",
                            "portal_kind": "library",
                            "retrieval_strategy": "mixed",
                            "languages": ["ja"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "target_pdf_document",
                            "title": "Target PDF",
                            "issuing_body": "MHLW",
                            "canonical_url": "https://example.com/files/correct.pdf",
                            "retrieval_urls": [
                                "https://example.com/reports/test-report.html"
                            ],
                            "document_type": "regulatory_guidance",
                            "binding_strength": "regulatory_guidance",
                            "publication_date": "2026-01-01",
                            "languages": ["ja"],
                            "document_format": "pdf",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    requested_urls: list[str] = []

    def fake_urlopen(request, timeout=20):
        requested_urls.append(request.full_url)
        if request.full_url == "https://example.com/reports/test-report.html":
            return FakeResponse(
                (
                    b"<html><body>"
                    b'<a href="/files/unrelated.pdf">Unrelated PDF</a>'
                    b'<a href="/files/correct.pdf">Correct PDF</a>'
                    b"</body></html>"
                ),
                url=request.full_url,
            )
        return FakeResponse(
            b"%PDF-1.7 test fixture",
            content_type="application/pdf",
            url=request.full_url,
        )

    monkeypatch.setattr(retrieval, "urlopen", fake_urlopen)

    results = retrieval.fetch_seed_documents()

    assert results[0] == {
        "jurisdiction": "japan",
        "document_id": "target_pdf_document",
        "status": "downloaded_new",
        "attempts": "2",
        "artifact_state": "new",
        "status_code": "200",
    }
    assert requested_urls == [
        "https://example.com/reports/test-report.html",
        "https://example.com/files/correct.pdf",
    ]

    metadata = _read_json(tmp_path / "raw" / "japan" / "target_pdf_document" / "metadata.json")
    assert metadata["fetch_url"] == "https://example.com/files/correct.pdf"


def test_fetch_seed_documents_accepts_pdf_magic_bytes_with_octet_stream_content_type(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "south_korea",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Portal",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com",
                            "portal_kind": "library",
                            "retrieval_strategy": "mixed",
                            "languages": ["ko"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "test_pdf_document",
                            "title": "Test PDF",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com/download",
                            "document_type": "regulatory_guidance",
                            "binding_strength": "regulatory_guidance",
                            "publication_date": "2026-01-01",
                            "languages": ["ko"],
                            "document_format": "pdf",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    monkeypatch.setattr(
        retrieval,
        "urlopen",
        lambda request, timeout=20: FakeResponse(
            b"%PDF-1.7 octet-stream fixture",
            content_type="application/octet-stream",
            url=request.full_url,
        ),
    )

    results = retrieval.fetch_seed_documents()

    assert results == [
        {
            "jurisdiction": "south_korea",
            "document_id": "test_pdf_document",
            "status": "downloaded_new",
            "attempts": "1",
            "artifact_state": "new",
            "status_code": "200",
        }
    ]

    metadata = _read_json(tmp_path / "raw" / "south_korea" / "test_pdf_document" / "metadata.json")
    assert metadata["content_type"] == "application/octet-stream"
    assert str(metadata["artifact_path"]).endswith("source.pdf")


def test_fetch_seed_documents_uses_browser_fallback_for_browser_required_document(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(retrieval, "RAW_DATA_DIR", tmp_path / "raw")
    monkeypatch.setattr(retrieval, "RETRIEVAL_DATA_DIR", tmp_path / "retrieval")
    monkeypatch.setattr(
        retrieval,
        "load_all_source_manifests",
        lambda: [
            JurisdictionManifest.model_validate(
                {
                    "manifest_version": "2026-04-14",
                    "jurisdiction": "south_korea",
                    "description": "Test fixture",
                    "source_portals": [
                        {
                            "id": "portal",
                            "name": "Law Portal",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com",
                            "portal_kind": "registry",
                            "retrieval_strategy": "browser",
                            "languages": ["ko"],
                            "priority": "high",
                            "coverage_notes": "Test fixture",
                        }
                    ],
                    "seed_documents": [
                        {
                            "id": "test_browser_document",
                            "title": "Test Browser Document",
                            "issuing_body": "Test Agency",
                            "canonical_url": "https://example.com/document",
                            "browser_required": True,
                            "browser_wait_for_selector": "#content",
                            "document_type": "legislation",
                            "binding_strength": "binding_law",
                            "publication_date": "2026-01-01",
                            "languages": ["ko"],
                            "document_format": "html",
                            "source_portal_ids": ["portal"],
                            "priority": "high",
                            "relevance_notes": "Test fixture",
                        }
                    ],
                }
            )
        ],
    )

    captured_browser_kwargs: dict[str, object] = {}

    def _fake_browser_fetch(
        url,
        wait_for_selector=None,
        min_text_length=None,
        click_selectors=None,
        timeout_seconds=45,
        user_agent=None,
        locale="en-US",
    ):
        captured_browser_kwargs["locale"] = locale
        captured_browser_kwargs["wait_for_selector"] = wait_for_selector
        return BrowserFetchResult(
            payload=b"<html><body><div id='content'>Rendered law text</div></body></html>",
            content_type="text/html; charset=utf-8",
            status_code=200,
            resolved_url=url,
        )

    monkeypatch.setattr(retrieval, "urlopen", lambda request, timeout=20: (_ for _ in ()).throw(TimeoutError()))
    monkeypatch.setattr(retrieval, "fetch_url_with_browser", _fake_browser_fetch)

    results = retrieval.fetch_seed_documents(use_browser=True)

    assert captured_browser_kwargs["locale"] == "ko-KR"
    assert captured_browser_kwargs["wait_for_selector"] == "#content"

    assert results == [
        {
            "jurisdiction": "south_korea",
            "document_id": "test_browser_document",
            "status": "downloaded_new",
            "attempts": "1",
            "artifact_state": "new",
            "status_code": "200",
        }
    ]

    metadata = _read_json(
        tmp_path / "raw" / "south_korea" / "test_browser_document" / "metadata.json"
    )
    assert metadata["transport"] == "browser"
    assert metadata["browser_required"] is True
    assert metadata["browser_wait_for_selector"] == "#content"
