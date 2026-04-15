import json
from pathlib import Path

import observatory.discovery as discovery_module
from observatory.source_registry import JurisdictionManifest


def _manifest_with_discovery() -> JurisdictionManifest:
    return JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "united_states",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/portal",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "discovery_targets": [
                        {
                            "url": "https://example.com/portal",
                            "kind": "html_links",
                            "link_selector": "a[href]",
                            "include_url_patterns": ["/ai/"],
                            "exclude_url_patterns": ["/ignore/"],
                            "max_candidates": 10,
                        }
                    ],
                }
            ],
            "seed_documents": [
                {
                    "id": "seed",
                    "title": "Seed",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/seed",
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )


def _manifest_with_sitemap_discovery() -> JurisdictionManifest:
    return JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "european_union",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/sitemap.xml",
                    "portal_kind": "library",
                    "retrieval_strategy": "html",
                    "languages": ["en"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "discovery_targets": [
                        {
                            "url": "https://example.com/sitemap.xml",
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
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/seed",
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "languages": ["en"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )


def test_discover_source_candidates_from_html_links(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(discovery_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(
        discovery_module,
        "load_all_source_manifests",
        lambda: [_manifest_with_discovery()],
    )
    monkeypatch.setattr(
        discovery_module,
        "_fetch_target_payload",
        lambda target, use_browser: (
            (
                b"<html><body>"
                b'<a href="/ai/one">AI One</a>'
                b'<a href="/ignore/two">Ignore</a>'
                b'<a href="https://example.com/ai/three;jsessionid=abc123#section">AI Three</a>'
                b"</body></html>"
            ),
            "https://example.com/portal",
        ),
    )

    results = discovery_module.discover_source_candidates(refresh=True)

    assert results == [
        {
            "jurisdiction": "united_states",
            "portal_id": "portal",
            "status": "discovered",
            "candidate_count": "2",
        }
    ]

    output_path = tmp_path / "discovery" / "united_states" / "portal.json"
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert [candidate["url"] for candidate in payload["candidates"]] == [
        "https://example.com/ai/one",
        "https://example.com/ai/three",
    ]


def test_discover_source_candidates_filters_by_title_patterns(tmp_path: Path, monkeypatch) -> None:
    manifest = JurisdictionManifest.model_validate(
        {
            "manifest_version": "2026-04-14",
            "jurisdiction": "china",
            "description": "Test fixture",
            "source_portals": [
                {
                    "id": "portal",
                    "name": "Portal",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/portal",
                    "portal_kind": "portal",
                    "retrieval_strategy": "html",
                    "languages": ["zh"],
                    "priority": "high",
                    "coverage_notes": "Fixture",
                    "discovery_targets": [
                        {
                            "url": "https://example.com/portal",
                            "kind": "html_links",
                            "link_selector": "a[href]",
                            "include_title_patterns": ["人工智能", "算法"],
                            "exclude_title_patterns": ["会议"],
                            "max_candidates": 10,
                        }
                    ],
                }
            ],
            "seed_documents": [
                {
                    "id": "seed",
                    "title": "Seed",
                    "issuing_body": "Agency",
                    "canonical_url": "https://example.com/seed",
                    "document_type": "strategy_paper",
                    "binding_strength": "strategy_statement",
                    "languages": ["zh"],
                    "document_format": "html",
                    "source_portal_ids": ["portal"],
                    "priority": "high",
                    "relevance_notes": "Fixture",
                }
            ],
        }
    )
    monkeypatch.setattr(discovery_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(discovery_module, "load_all_source_manifests", lambda: [manifest])
    monkeypatch.setattr(
        discovery_module,
        "_fetch_target_payload",
        lambda target, use_browser: (
            (
                "<html><body>"
                '<a href="/2026-04/14/content_1.htm">人工智能治理办法</a>'
                '<a href="/2026-04/14/content_2.htm">算法备案会议纪要</a>'
                '<a href="/2026-04/14/content_3.htm">其他通知</a>'
                "</body></html>"
            ).encode("utf-8"),
            "https://example.com/portal",
        ),
    )

    results = discovery_module.discover_source_candidates(refresh=True)

    assert results == [
        {
            "jurisdiction": "china",
            "portal_id": "portal",
            "status": "discovered",
            "candidate_count": "1",
        }
    ]


def test_discover_source_candidates_from_sitemap(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(discovery_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(
        discovery_module,
        "load_all_source_manifests",
        lambda: [_manifest_with_sitemap_discovery()],
    )
    monkeypatch.setattr(
        discovery_module,
        "_fetch_target_payload",
        lambda target, use_browser: (
            b"""<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/ai/one</loc><lastmod>2026-04-14</lastmod></url>
              <url><loc>https://example.com/other/two</loc></url>
            </urlset>
            """,
            "https://example.com/sitemap.xml",
        ),
    )

    results = discovery_module.discover_source_candidates(refresh=True)

    assert results == [
        {
            "jurisdiction": "european_union",
            "portal_id": "portal",
            "status": "discovered",
            "candidate_count": "1",
        }
    ]


def test_discover_source_candidates_uses_cache_without_refresh(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(discovery_module, "DISCOVERY_DIR", tmp_path / "discovery")
    monkeypatch.setattr(
        discovery_module,
        "load_all_source_manifests",
        lambda: [_manifest_with_discovery()],
    )
    output_path = tmp_path / "discovery" / "united_states" / "portal.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "jurisdiction": "united_states",
                "portal_id": "portal",
                "candidates": [{"url": "https://example.com/ai/one"}],
            }
        ),
        encoding="utf-8",
    )

    results = discovery_module.discover_source_candidates(refresh=False)

    assert results == [
        {
            "jurisdiction": "united_states",
            "portal_id": "portal",
            "status": "cached",
            "candidate_count": "1",
        }
    ]
