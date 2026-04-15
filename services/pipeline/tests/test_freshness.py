from observatory import freshness


def test_run_source_refresh_aggregates_discovery_fetch_and_blocked_docs(monkeypatch) -> None:
    monkeypatch.setattr(
        freshness,
        "discover_source_candidates",
        lambda jurisdiction, portal_id, refresh, use_browser: [
            {
                "jurisdiction": jurisdiction or "japan",
                "portal_id": portal_id or "portal",
                "status": "discovered",
                "candidate_count": "3",
            }
        ],
    )
    monkeypatch.setattr(
        freshness,
        "fetch_seed_documents",
        lambda jurisdiction, refresh, max_attempts, use_browser: [
            {
                "jurisdiction": jurisdiction or "japan",
                "document_id": "seed",
                "status": "downloaded_new",
                "attempts": "1",
            }
        ],
    )
    monkeypatch.setattr(
        freshness,
        "write_source_inventory",
        lambda: {
            "inventory_json_path": "data/source_tracking/source_inventory.json",
            "inventory_markdown_path": "docs/operations/source-inventory.md",
            "jurisdictions": [
                {
                    "jurisdiction": "japan",
                    "seed_documents": [
                        {
                            "id": "seed",
                            "fetched": True,
                            "latest_retrieval_status": "downloaded_new",
                        },
                        {
                            "id": "blocked_seed",
                            "fetched": False,
                            "latest_retrieval_status": "timeout",
                        },
                    ],
                }
            ],
        },
    )

    result = freshness.run_source_refresh(jurisdiction="japan", portal_id="portal", use_browser_fetch=True)

    assert result["discovery_results"][0]["status"] == "discovered"
    assert result["fetch_results"][0]["status"] == "downloaded_new"
    assert result["blocked_documents"] == [
        {
            "jurisdiction": "japan",
            "document_id": "blocked_seed",
            "latest_retrieval_status": "timeout",
        }
    ]


def test_run_source_refresh_requires_work(monkeypatch) -> None:
    monkeypatch.setattr(freshness, "write_source_inventory", lambda: {})

    try:
        freshness.run_source_refresh(discover=False, fetch=False)
    except ValueError as exc:
        assert str(exc) == "source refresh requires discover or fetch to be enabled"
    else:
        raise AssertionError("expected ValueError")
