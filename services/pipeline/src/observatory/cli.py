from __future__ import annotations

import sys
from pathlib import Path

from observatory.analysis import (
    analyze_jurisdictions,
    analyze_parsed_documents,
    persist_analysis_artifacts,
)
from observatory.audit import write_source_quality_audit
from observatory.coverage import write_source_inventory
from observatory.db import apply_sql_migrations, sync_database_to_source_manifests
from observatory.discovery import discover_source_candidates
from observatory.expansion import write_source_expansion_plan
from observatory.freshness import run_source_refresh
from observatory.metadata_sync import sync_source_metadata
from observatory.parser import parse_raw_documents
from observatory.source_promotion import enrich_source_candidates, promote_source_families
from observatory.retrieval import fetch_seed_documents, import_local_seed_document
from observatory.source_registry import (
    load_all_source_manifests,
    summarize_source_manifests,
    validate_source_manifests,
)
from observatory.taxonomy import validate_taxonomy


def app() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "usage: observatory <validate-taxonomy|validate-sources|summarize-sources|report-source-coverage|report-source-expansion-plan|report-source-quality-audit|sync-source-metadata|discover-source-candidates|enrich-source-candidates|promote-source-families|fetch-seed-documents|refresh-sources|import-local-document|parse-raw-documents|analyze-documents|analyze-jurisdictions|persist-analysis-artifacts|migrate-db|sync-db-to-source-manifests>"
        )

    command = sys.argv[1]
    if command == "validate-taxonomy":
        validate_taxonomy()
        print("taxonomy ok")
        return
    if command == "validate-sources":
        validate_source_manifests()
        print("sources ok")
        return
    if command == "summarize-sources":
        manifests = load_all_source_manifests()
        for jurisdiction, portal_count, document_count in summarize_source_manifests(manifests):
            print(f"{jurisdiction}: {portal_count} portals, {document_count} seed documents")
        return
    if command == "report-source-coverage":
        inventory = write_source_inventory()
        print(f"wrote {inventory['inventory_json_path']}")
        print(f"wrote {inventory['inventory_markdown_path']}")
        for jurisdiction in inventory["jurisdictions"]:
            print(
                f"{jurisdiction['jurisdiction']}: "
                f"portals={jurisdiction['portal_count']} "
                f"seed_documents={jurisdiction['seed_document_count']} "
                f"fetched={jurisdiction['fetched_seed_document_count']} "
                f"parsed={jurisdiction['parsed_seed_document_count']} "
                f"analyzed={jurisdiction['analyzed_seed_document_count']}"
            )
        return
    if command == "report-source-expansion-plan":
        plan = write_source_expansion_plan()
        print(f"wrote {plan['plan_json_path']}")
        print(f"wrote {plan['plan_markdown_path']}")
        for candidate in plan["global_priority_families"][:10]:
            print(
                f"{candidate['jurisdiction']}: {candidate['portal_id']} -> "
                f"{candidate['best_recommendation']} ({candidate['proposed_source_tier']}) :: "
                f"{candidate['family_label']} :: {candidate['representative_title'] or candidate['representative_url']}"
            )
        return
    if command == "report-source-quality-audit":
        audit = write_source_quality_audit()
        print(f"wrote {audit['audit_json_path']}")
        print(f"wrote {audit['audit_markdown_path']}")
        for jurisdiction in audit["jurisdictions"]:
            counts = jurisdiction["action_counts"]
            print(
                f"{jurisdiction['jurisdiction']}: "
                f"keep_core={counts.get('keep_core', 0)} "
                f"keep_supporting={counts.get('keep_supporting', 0)} "
                f"review_for_removal={counts.get('review_for_removal', 0)} "
                f"remove_from_seed={counts.get('remove_from_seed', 0)}"
            )
        return
    if command == "sync-source-metadata":
        results = sync_source_metadata()
        for result in results:
            print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}")
        return
    if command == "enrich-source-candidates":
        jurisdiction: str | None = None
        portal_id: str | None = None
        refresh = False
        use_browser = False
        limit = 5
        recommendations: set[str] = {"promote_now", "inspect_next"}
        for argument in sys.argv[2:]:
            if argument == "--refresh":
                refresh = True
                continue
            if argument == "--with-browser":
                use_browser = True
                continue
            if argument.startswith("--portal-id="):
                portal_id = argument.split("=", 1)[1]
                continue
            if argument.startswith("--limit="):
                try:
                    limit = int(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("enrich-source-candidates --limit must be an integer") from exc
                continue
            if argument.startswith("--recommendations="):
                recommendations = {
                    item.strip()
                    for item in argument.split("=", 1)[1].split(",")
                    if item.strip()
                }
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown enrich-source-candidates option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory enrich-source-candidates [jurisdiction] [--portal-id=PORTAL] [--recommendations=LIST] [--limit=N] [--refresh] [--with-browser]"
                )
            jurisdiction = argument
        results = enrich_source_candidates(
            jurisdiction=jurisdiction,
            portal_id=portal_id,
            refresh=refresh,
            recommendations=recommendations,
            limit=limit,
            use_browser=use_browser,
        )
        for result in results:
            suffix = f" (candidates={result['candidate_count']})" if "candidate_count" in result else ""
            if "output_path" in result:
                suffix += f" [{result['output_path']}]"
            print(f"{result['jurisdiction']}: {result['portal_id']} -> {result['status']}{suffix}")
        return
    if command == "promote-source-families":
        jurisdiction: str | None = None
        portal_id: str | None = None
        use_browser = False
        limit = 10
        recommendations: set[str] = {"promote_now"}
        for argument in sys.argv[2:]:
            if argument == "--with-browser":
                use_browser = True
                continue
            if argument.startswith("--portal-id="):
                portal_id = argument.split("=", 1)[1]
                continue
            if argument.startswith("--limit="):
                try:
                    limit = int(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("promote-source-families --limit must be an integer") from exc
                continue
            if argument.startswith("--recommendations="):
                recommendations = {
                    item.strip()
                    for item in argument.split("=", 1)[1].split(",")
                    if item.strip()
                }
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown promote-source-families option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory promote-source-families [jurisdiction] [--portal-id=PORTAL] [--recommendations=LIST] [--limit=N] [--with-browser]"
                )
            jurisdiction = argument
        results = promote_source_families(
            jurisdiction=jurisdiction,
            portal_id=portal_id,
            recommendations=recommendations,
            limit=limit,
            use_browser=use_browser,
        )
        for result in results:
            suffix_parts = []
            if "document_id" in result:
                suffix_parts.append(f"document_id={result['document_id']}")
            if "error" in result:
                suffix_parts.append(f"error={result['error']}")
            suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
            print(f"{result['jurisdiction']}: {result['portal_id']} -> {result['status']}{suffix}")
        return
    if command == "fetch-seed-documents":
        jurisdiction: str | None = None
        refresh = False
        max_attempts = 3
        use_browser = False
        for argument in sys.argv[2:]:
            if argument == "--refresh":
                refresh = True
                continue
            if argument == "--with-browser":
                use_browser = True
                continue
            if argument.startswith("--max-attempts="):
                try:
                    max_attempts = int(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("fetch-seed-documents --max-attempts must be an integer") from exc
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown fetch-seed-documents option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory fetch-seed-documents [jurisdiction] [--refresh] [--with-browser] [--max-attempts=N]"
                )
            jurisdiction = argument

        results = fetch_seed_documents(
            jurisdiction=jurisdiction,
            refresh=refresh,
            max_attempts=max_attempts,
            use_browser=use_browser,
        )
        for result in results:
            suffix_parts = []
            if "artifact_state" in result:
                suffix_parts.append(f"artifact={result['artifact_state']}")
            if "status_code" in result:
                suffix_parts.append(f"status_code={result['status_code']}")
            if "attempts" in result:
                suffix_parts.append(f"attempts={result['attempts']}")
            if "error" in result:
                suffix_parts.append(f"error={result['error']}")
            suffix = ""
            if suffix_parts:
                suffix = " (" + ", ".join(suffix_parts) + ")"
            print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}{suffix}")
        return
    if command == "analyze-jurisdictions":
        jurisdiction = sys.argv[2] if len(sys.argv) > 2 else None
        refresh = "--refresh" in sys.argv[2:]
        positional = [argument for argument in sys.argv[2:] if not argument.startswith("--")]
        if len(positional) > 1:
            raise SystemExit("usage: observatory analyze-jurisdictions [jurisdiction] [--refresh]")
        jurisdiction = positional[0] if positional else None
        results = analyze_jurisdictions(jurisdiction=jurisdiction, refresh_existing=refresh)
        for result in results:
            print(f"{result['jurisdiction']} -> {result['status']}")
        return
    if command == "refresh-sources":
        jurisdiction: str | None = None
        portal_id: str | None = None
        max_attempts = 3
        use_browser_discovery = False
        use_browser_fetch = False
        skip_discovery = False
        skip_fetch = False
        for argument in sys.argv[2:]:
            if argument == "--skip-discovery":
                skip_discovery = True
                continue
            if argument == "--skip-fetch":
                skip_fetch = True
                continue
            if argument == "--discover-with-browser":
                use_browser_discovery = True
                continue
            if argument == "--fetch-with-browser":
                use_browser_fetch = True
                continue
            if argument.startswith("--portal-id="):
                portal_id = argument.split("=", 1)[1]
                continue
            if argument.startswith("--max-attempts="):
                try:
                    max_attempts = int(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("refresh-sources --max-attempts must be an integer") from exc
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown refresh-sources option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory refresh-sources [jurisdiction] [--portal-id=PORTAL] [--max-attempts=N] [--discover-with-browser] [--fetch-with-browser] [--skip-discovery] [--skip-fetch]"
                )
            jurisdiction = argument

        try:
            result = run_source_refresh(
                jurisdiction=jurisdiction,
                portal_id=portal_id,
                max_attempts=max_attempts,
                discover=not skip_discovery,
                fetch=not skip_fetch,
                use_browser_discovery=use_browser_discovery,
                use_browser_fetch=use_browser_fetch,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

        print(f"wrote {result['inventory_json_path']}")
        print(f"wrote {result['inventory_markdown_path']}")
        print(f"wrote {result['expansion_json_path']}")
        print(f"wrote {result['expansion_markdown_path']}")
        for discovery_result in result["discovery_results"]:
            suffix = f" (candidates={discovery_result['candidate_count']})" if "candidate_count" in discovery_result else ""
            print(
                f"discover: {discovery_result['jurisdiction']}: {discovery_result['portal_id']} -> {discovery_result['status']}{suffix}"
            )
        for fetch_result in result["fetch_results"]:
            suffix_parts = []
            if "artifact_state" in fetch_result:
                suffix_parts.append(f"artifact={fetch_result['artifact_state']}")
            if "status_code" in fetch_result:
                suffix_parts.append(f"status_code={fetch_result['status_code']}")
            if "attempts" in fetch_result:
                suffix_parts.append(f"attempts={fetch_result['attempts']}")
            if "error" in fetch_result:
                suffix_parts.append(f"error={fetch_result['error']}")
            suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
            print(f"fetch: {fetch_result['jurisdiction']}: {fetch_result['document_id']} -> {fetch_result['status']}{suffix}")
        if result["blocked_documents"]:
            print("blocked seed documents:")
            for blocked in result["blocked_documents"]:
                print(
                    f"  {blocked['jurisdiction']}: {blocked['document_id']} ({blocked['latest_retrieval_status']})"
                )
        else:
            print("blocked seed documents: none")
        return
    if command == "import-local-document":
        if len(sys.argv) < 5:
            raise SystemExit(
                "usage: observatory import-local-document <jurisdiction> <document_id> <file_path> [--source-url=URL] [--resolved-url=URL] [--content-type=TYPE]"
            )
        jurisdiction = sys.argv[2]
        document_id = sys.argv[3]
        file_path = sys.argv[4]
        source_url: str | None = None
        resolved_url: str | None = None
        content_type: str | None = None
        for argument in sys.argv[5:]:
            if argument.startswith("--source-url="):
                source_url = argument.split("=", 1)[1]
                continue
            if argument.startswith("--resolved-url="):
                resolved_url = argument.split("=", 1)[1]
                continue
            if argument.startswith("--content-type="):
                content_type = argument.split("=", 1)[1]
                continue
            raise SystemExit(f"unknown import-local-document option: {argument}")
        try:
            result = import_local_seed_document(
                jurisdiction=jurisdiction,
                document_id=document_id,
                file_path=Path(file_path),
                source_url=source_url,
                resolved_url=resolved_url,
                content_type=content_type,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        suffix = ""
        if "artifact_state" in result:
            suffix = f" (artifact={result['artifact_state']})"
        print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}{suffix}")
        return
    if command == "discover-source-candidates":
        jurisdiction: str | None = None
        portal_id: str | None = None
        refresh = False
        use_browser = False
        for argument in sys.argv[2:]:
            if argument == "--refresh":
                refresh = True
                continue
            if argument == "--with-browser":
                use_browser = True
                continue
            if argument.startswith("--portal-id="):
                portal_id = argument.split("=", 1)[1]
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown discover-source-candidates option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory discover-source-candidates [jurisdiction] [--portal-id=PORTAL] [--refresh] [--with-browser]"
                )
            jurisdiction = argument

        try:
            results = discover_source_candidates(
                jurisdiction=jurisdiction,
                portal_id=portal_id,
                refresh=refresh,
                use_browser=use_browser,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            suffix_parts = []
            if "candidate_count" in result:
                suffix_parts.append(f"candidates={result['candidate_count']}")
            if "error" in result:
                suffix_parts.append(f"error={result['error']}")
            suffix = ""
            if suffix_parts:
                suffix = " (" + ", ".join(suffix_parts) + ")"
            print(f"{result['jurisdiction']}: {result['portal_id']} -> {result['status']}{suffix}")
        return
    if command == "parse-raw-documents":
        jurisdiction = sys.argv[2] if len(sys.argv) > 2 else None
        results = parse_raw_documents(jurisdiction=jurisdiction)
        for result in results:
            print(
                f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}"
            )
        return
    if command == "analyze-documents":
        jurisdiction: str | None = None
        document_id: str | None = None
        refresh_existing = False
        for argument in sys.argv[2:]:
            if argument == "--refresh":
                refresh_existing = True
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown analyze-documents option: {argument}")
            if jurisdiction is None:
                jurisdiction = argument
                continue
            if document_id is None:
                document_id = argument
                continue
            raise SystemExit("usage: observatory analyze-documents [jurisdiction] [document_id] [--refresh]")
        try:
            results = analyze_parsed_documents(
                jurisdiction=jurisdiction,
                document_id=document_id,
                refresh_existing=refresh_existing,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            if "document_id" in result:
                print(
                    f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}"
                )
            else:
                print(f"{result['jurisdiction']}: {result['status']}")
        return
    if command == "persist-analysis-artifacts":
        jurisdiction = sys.argv[2] if len(sys.argv) > 2 else None
        document_id = sys.argv[3] if len(sys.argv) > 3 else None
        try:
            results = persist_analysis_artifacts(jurisdiction=jurisdiction, document_id=document_id)
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            if "document_id" in result:
                print(
                    f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}"
                )
            else:
                print(f"{result['jurisdiction']}: {result['status']}")
        return
    if command == "migrate-db":
        try:
            applied = apply_sql_migrations()
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        if not applied:
            print("database already up to date")
            return
        for version in applied:
            print(f"applied {version}")
        return
    if command == "sync-db-to-source-manifests":
        jurisdiction: str | None = None
        reset_jurisdiction_analyses = False
        for argument in sys.argv[2:]:
            if argument == "--reset-jurisdiction-analyses":
                reset_jurisdiction_analyses = True
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown sync-db-to-source-manifests option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory sync-db-to-source-manifests [jurisdiction] [--reset-jurisdiction-analyses]"
                )
            jurisdiction = argument
        try:
            result = sync_database_to_source_manifests(
                jurisdiction=jurisdiction,
                reset_jurisdiction_analyses=reset_jurisdiction_analyses,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

        deleted_document_ids = result["deleted_document_ids"]
        print(
            "sync-db-to-source-manifests: "
            f"kept={result['kept_document_count']} "
            f"deleted={len(deleted_document_ids)} "
            f"jurisdictions={','.join(result['scoped_jurisdictions'])}"
        )
        if deleted_document_ids:
            for document_id in deleted_document_ids:
                print(f"deleted {document_id}")
        if result["reset_jurisdiction_analyses"]:
            print("reset machine_jurisdiction_analyses")
        return
    raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    app()
