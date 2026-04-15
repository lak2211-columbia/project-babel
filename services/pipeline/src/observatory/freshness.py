from __future__ import annotations

from observatory.coverage import write_source_inventory
from observatory.discovery import discover_source_candidates
from observatory.expansion import write_source_expansion_plan
from observatory.retrieval import fetch_seed_documents


def run_source_refresh(
    jurisdiction: str | None = None,
    *,
    portal_id: str | None = None,
    max_attempts: int = 3,
    discover: bool = True,
    fetch: bool = True,
    refresh_discovery: bool = True,
    refresh_fetch: bool = True,
    use_browser_discovery: bool = False,
    use_browser_fetch: bool = False,
) -> dict[str, object]:
    if not discover and not fetch:
        raise ValueError("source refresh requires discover or fetch to be enabled")
    if max_attempts < 1:
        raise ValueError("max_attempts must be at least 1")

    discovery_results: list[dict[str, str]] = []
    fetch_results: list[dict[str, str]] = []

    if discover:
        discovery_results = discover_source_candidates(
            jurisdiction=jurisdiction,
            portal_id=portal_id,
            refresh=refresh_discovery,
            use_browser=use_browser_discovery,
        )

    if fetch:
        fetch_results = fetch_seed_documents(
            jurisdiction=jurisdiction,
            refresh=refresh_fetch,
            max_attempts=max_attempts,
            use_browser=use_browser_fetch,
        )

    inventory = write_source_inventory()
    expansion = write_source_expansion_plan()
    jurisdictions = inventory["jurisdictions"]
    if jurisdiction is not None:
        jurisdictions = [item for item in jurisdictions if item["jurisdiction"] == jurisdiction]

    blocked_documents: list[dict[str, str]] = []
    for jurisdiction_payload in jurisdictions:
        for document in jurisdiction_payload["seed_documents"]:
            if document["fetched"]:
                continue
            blocked_documents.append(
                {
                    "jurisdiction": jurisdiction_payload["jurisdiction"],
                    "document_id": document["id"],
                    "latest_retrieval_status": document["latest_retrieval_status"] or "n/a",
                }
            )

    return {
        "jurisdiction": jurisdiction,
        "portal_id": portal_id,
        "discovery_results": discovery_results,
        "fetch_results": fetch_results,
        "blocked_documents": blocked_documents,
        "inventory_json_path": inventory["inventory_json_path"],
        "inventory_markdown_path": inventory["inventory_markdown_path"],
        "expansion_json_path": expansion["plan_json_path"],
        "expansion_markdown_path": expansion["plan_markdown_path"],
    }
