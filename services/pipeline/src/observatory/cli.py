from __future__ import annotations

import json
import sys
from pathlib import Path

from observatory.analysis import (
    DEFAULT_GEMINI_MODEL,
    analyze_jurisdictions,
    analyze_parsed_documents,
    check_corpus_grounding,
    evaluate_gold_set,
    export_json_schemas,
    ingest_document_analysis,
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
from observatory.retrieval import fetch_seed_documents, import_local_seed_document
from observatory.schema_validation import validate_repository_artifacts
from observatory.source_promotion import enrich_source_candidates, promote_source_families
from observatory.source_registry import (
    load_all_source_manifests,
    summarize_source_manifests,
    validate_source_manifests,
)
from observatory.taxonomy import get_canonical_thresholds, validate_taxonomy


USAGE = (
    "usage: observatory <validate-taxonomy|validate-sources|validate-artifacts|summarize-sources|"
    "report-source-coverage|report-source-expansion-plan|report-source-quality-audit|"
    "sync-source-metadata|discover-source-candidates|enrich-source-candidates|"
    "promote-source-families|fetch-seed-documents|refresh-sources|import-local-document|"
    "parse-raw-documents|analyze-documents|ingest-document-analysis|analyze-jurisdictions|persist-analysis-artifacts|"
    "check-grounding|export-schemas|evaluate-gold-set|migrate-db|sync-db-to-source-manifests>"
)


def app(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        raise SystemExit(USAGE)

    command = args[0]
    rest = args[1:]

    if command == "validate-taxonomy":
        validate_taxonomy()
        print("taxonomy ok")
        return
    if command == "validate-sources":
        validate_source_manifests()
        print("sources ok")
        return
    if command == "validate-artifacts":
        as_json = False
        for argument in rest:
            if argument == "--json":
                as_json = True
                continue
            raise SystemExit(f"unknown validate-artifacts option: {argument}")
        report = validate_repository_artifacts()
        if as_json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            for check in report["checks"]:
                print(f"{check['schema']}: validated={check['count']} errors={check['errors']}")
            if report["error_count"] == 0:
                print(f"artifacts ok ({report['validated_count']} validated)")
            else:
                for err in report["errors"][:25]:
                    print(f"  ERROR {err['artifact']} ({err['schema']} {err['path']}): {err['message']}")
        if report["error_count"] > 0:
            raise SystemExit(f"artifact schema validation failed with {report['error_count']} errors")
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
        for argument in rest:
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
        jurisdiction = None
        portal_id = None
        use_browser = False
        limit = 10
        recommendations = {"promote_now"}
        for argument in rest:
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
        jurisdiction = None
        refresh = False
        max_attempts = 3
        use_browser = False
        fetch_companions = False
        for argument in rest:
            if argument == "--refresh":
                refresh = True
                continue
            if argument == "--with-browser":
                use_browser = True
                continue
            if argument == "--with-companions":
                fetch_companions = True
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
                    "usage: observatory fetch-seed-documents [jurisdiction] [--refresh] [--with-browser] [--with-companions] [--max-attempts=N]"
                )
            jurisdiction = argument

        results = fetch_seed_documents(
            jurisdiction=jurisdiction,
            refresh=refresh,
            max_attempts=max_attempts,
            use_browser=use_browser,
            fetch_companions=fetch_companions,
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
            suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
            print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}{suffix}")
        return
    if command == "analyze-jurisdictions":
        jurisdiction = None
        refresh = False
        for argument in rest:
            if argument in {"--refresh", "--refresh-existing"}:
                refresh = True
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown analyze-jurisdictions option: {argument}")
            if jurisdiction is not None:
                raise SystemExit("usage: observatory analyze-jurisdictions [jurisdiction] [--refresh|--refresh-existing]")
            jurisdiction = argument
        results = analyze_jurisdictions(jurisdiction=jurisdiction, refresh_existing=refresh)
        for result in results:
            print(f"{result['jurisdiction']} -> {result['status']}")
        return
    if command == "refresh-sources":
        jurisdiction = None
        portal_id = None
        max_attempts = 3
        use_browser_discovery = False
        use_browser_fetch = False
        skip_discovery = False
        skip_fetch = False
        for argument in rest:
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
        if len(rest) < 3:
            raise SystemExit(
                "usage: observatory import-local-document <jurisdiction> <document_id> <file_path> [--source-url=URL] [--resolved-url=URL] [--content-type=TYPE]"
            )
        jurisdiction = rest[0]
        document_id = rest[1]
        file_path = rest[2]
        source_url: str | None = None
        resolved_url: str | None = None
        content_type: str | None = None
        for argument in rest[3:]:
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
        suffix = f" (artifact={result['artifact_state']})" if "artifact_state" in result else ""
        print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}{suffix}")
        return
    if command == "discover-source-candidates":
        jurisdiction = None
        portal_id = None
        refresh = False
        use_browser = False
        for argument in rest:
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
            suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
            print(f"{result['jurisdiction']}: {result['portal_id']} -> {result['status']}{suffix}")
        return
    if command == "parse-raw-documents":
        jurisdiction = None
        document_id: str | None = None
        refresh = False
        for argument in rest:
            if argument == "--refresh":
                refresh = True
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown parse-raw-documents option: {argument}")
            if jurisdiction is None:
                jurisdiction = argument
                continue
            if document_id is None:
                document_id = argument
                continue
            raise SystemExit("usage: observatory parse-raw-documents [jurisdiction] [document_id] [--refresh]")
        try:
            results = parse_raw_documents(
                jurisdiction=jurisdiction,
                document_id=document_id,
                refresh=refresh,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}")
        return
    if command == "analyze-documents":
        jurisdiction = None
        document_id = None
        refresh_existing = False
        provider: str | None = None
        model: str | None = None
        effort: str | None = None
        workers = 1
        index = 0
        while index < len(rest):
            argument = rest[index]
            if argument in {"--refresh", "--refresh-existing"}:
                refresh_existing = True
                index += 1
                continue
            if argument.startswith("--provider="):
                provider = argument.split("=", 1)[1]
                index += 1
                continue
            if argument == "--provider":
                if index + 1 >= len(rest):
                    raise SystemExit("analyze-documents --provider requires a value")
                provider = rest[index + 1]
                index += 2
                continue
            if argument.startswith("--model="):
                model = argument.split("=", 1)[1]
                index += 1
                continue
            if argument == "--model":
                if index + 1 >= len(rest):
                    raise SystemExit("analyze-documents --model requires a value")
                model = rest[index + 1]
                index += 2
                continue
            if argument.startswith("--effort="):
                effort = argument.split("=", 1)[1]
                index += 1
                continue
            if argument == "--effort":
                if index + 1 >= len(rest):
                    raise SystemExit("analyze-documents --effort requires a value")
                effort = rest[index + 1]
                index += 2
                continue
            if argument.startswith("--workers="):
                try:
                    workers = int(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("analyze-documents --workers must be an integer") from exc
                index += 1
                continue
            if argument == "--workers":
                if index + 1 >= len(rest):
                    raise SystemExit("analyze-documents --workers requires an integer value")
                try:
                    workers = int(rest[index + 1])
                except ValueError as exc:
                    raise SystemExit("analyze-documents --workers must be an integer") from exc
                index += 2
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown analyze-documents option: {argument}")
            if jurisdiction is None:
                jurisdiction = argument
                index += 1
                continue
            if document_id is None:
                document_id = argument
                index += 1
                continue
            raise SystemExit(
                "usage: observatory analyze-documents [jurisdiction] [document_id] "
                "[--refresh] [--provider=auto|gemini|anthropic] [--model=MODEL] [--effort=LEVEL] [--workers=N]"
            )
        try:
            results = analyze_parsed_documents(
                jurisdiction=jurisdiction,
                document_id=document_id,
                provider=provider,
                model=model,
                effort=effort,
                workers=workers,
                refresh_existing=refresh_existing,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            if "document_id" in result:
                print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}")
            else:
                print(f"{result['jurisdiction']}: {result['status']}")
        return
    if command == "ingest-document-analysis":
        positionals: list[str] = []
        provider = "gemini"
        model = DEFAULT_GEMINI_MODEL
        effort: str | None = "xhigh"
        min_grounding = 0.90
        index = 0
        while index < len(rest):
            argument = rest[index]
            if argument.startswith("--provider="):
                provider = argument.split("=", 1)[1]
                index += 1
                continue
            if argument == "--provider":
                if index + 1 >= len(rest):
                    raise SystemExit("ingest-document-analysis --provider requires a value")
                provider = rest[index + 1]
                index += 2
                continue
            if argument.startswith("--model="):
                model = argument.split("=", 1)[1]
                index += 1
                continue
            if argument == "--model":
                if index + 1 >= len(rest):
                    raise SystemExit("ingest-document-analysis --model requires a value")
                model = rest[index + 1]
                index += 2
                continue
            if argument.startswith("--effort="):
                effort = argument.split("=", 1)[1] or None
                index += 1
                continue
            if argument == "--effort":
                if index + 1 >= len(rest):
                    raise SystemExit("ingest-document-analysis --effort requires a value")
                effort = rest[index + 1] or None
                index += 2
                continue
            if argument.startswith("--min-grounding="):
                try:
                    min_grounding = float(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("ingest-document-analysis --min-grounding must be a float") from exc
                index += 1
                continue
            if argument == "--min-grounding":
                if index + 1 >= len(rest):
                    raise SystemExit("ingest-document-analysis --min-grounding requires a float value")
                try:
                    min_grounding = float(rest[index + 1])
                except ValueError as exc:
                    raise SystemExit("ingest-document-analysis --min-grounding must be a float") from exc
                index += 2
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown ingest-document-analysis option: {argument}")
            positionals.append(argument)
            index += 1
        if len(positionals) != 3:
            raise SystemExit(
                "usage: observatory ingest-document-analysis <jurisdiction> <document_id> <input_json_path> "
                "[--provider=gemini] [--model=gemini-4-neon] [--effort=xhigh] [--min-grounding=0.90]"
            )
        target_jurisdiction, target_doc_id, raw_input_path = positionals
        try:
            result = ingest_document_analysis(
                jurisdiction=target_jurisdiction,
                document_id=target_doc_id,
                input_json_path=Path(raw_input_path),
                provider=provider,
                model=model,
                effort=effort,
                min_grounding=min_grounding,
            )
        except Exception as exc:
            print(str(exc), file=sys.stderr)
            raise SystemExit(1) from exc
        exact_pct = f"{result['exact_ratio']:.1%}" if result["exact_ratio"] is not None else "n/a"
        grounded_pct = f"{result['grounding_ratio']:.1%}" if result["grounding_ratio"] is not None else "n/a"
        print(
            f"{result['jurisdiction']}: {result['document_id']} -> {result['status']} "
            f"(exact={result['exact_matches']}/{result['total_quotes']} {exact_pct}, "
            f"grounded={grounded_pct}, snapped={result['snapped_quotes']}, "
            f"model={result['model']}/{result['effort']})"
        )
        return
    if command == "persist-analysis-artifacts":
        jurisdiction = None
        document_id = None
        allow_legacy = False
        for argument in rest:
            if argument == "--allow-legacy":
                allow_legacy = True
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown persist-analysis-artifacts option: {argument}")
            if jurisdiction is None:
                jurisdiction = argument
                continue
            if document_id is None:
                document_id = argument
                continue
            raise SystemExit("usage: observatory persist-analysis-artifacts [jurisdiction] [document_id] [--allow-legacy]")
        try:
            results = persist_analysis_artifacts(
                jurisdiction=jurisdiction,
                document_id=document_id,
                allow_legacy=allow_legacy,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        for result in results:
            if "document_id" in result:
                print(f"{result['jurisdiction']}: {result['document_id']} -> {result['status']}")
            else:
                print(f"{result['jurisdiction']}: {result['status']}")
        return
    if command == "check-grounding":
        jurisdiction = None
        document_id = None
        min_ratio = get_canonical_thresholds()["grounding_pass_threshold"]
        as_json = False
        for argument in rest:
            if argument == "--json":
                as_json = True
                continue
            if argument.startswith("--min-ratio="):
                try:
                    min_ratio = float(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("check-grounding --min-ratio must be a float") from exc
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown check-grounding option: {argument}")
            if jurisdiction is None:
                jurisdiction = argument
                continue
            if document_id is None:
                document_id = argument
                continue
            raise SystemExit("usage: observatory check-grounding [jurisdiction] [document_id] [--min-ratio=F] [--json]")
        try:
            report = check_corpus_grounding(
                jurisdiction=jurisdiction,
                document_id=document_id,
                min_ratio=min_ratio,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        if as_json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
            return
        exact_pct = f"{report['overall_exact_ratio']:.1%}" if report["overall_exact_ratio"] is not None else "n/a"
        grounded_pct = (
            f"{report['overall_grounding_ratio']:.1%}"
            if report["overall_grounding_ratio"] is not None
            else "n/a"
        )
        print(
            f"grounding: docs={report['document_count']} flagged={report['flagged_count']} "
            f"(gate={report['min_ratio_threshold']:.2f}) "
            f"exact={report['exact_matches']}/{report['total_quotes']} ({exact_pct}) "
            f"grounded={grounded_pct}"
        )
        for item in report["flagged_documents"][:20]:
            ratio_str = f"{item['grounding_ratio']:.2f}" if item["grounding_ratio"] is not None else "n/a"
            print(
                f"  flagged: {item['jurisdiction']}/{item['document_id']} "
                f"ratio={ratio_str} ungrounded={item['ungrounded_quotes']}/{item['total_quotes']}"
            )
        return
    if command == "export-schemas":
        if len(rest) != 1 or rest[0].startswith("--"):
            raise SystemExit("usage: observatory export-schemas <output_dir>")
        written = export_json_schemas(Path(rest[0]))
        for path_str in written:
            print(f"wrote {path_str}")
        return
    if command == "evaluate-gold-set":
        gold_path_arg: str | None = None
        output_json_path: Path | None = None
        index = 0
        while index < len(rest):
            argument = rest[index]
            if argument.startswith("--output-json="):
                output_json_path = Path(argument.split("=", 1)[1])
                index += 1
                continue
            if argument == "--output-json":
                if index + 1 >= len(rest):
                    raise SystemExit("evaluate-gold-set --output-json requires a file path")
                output_json_path = Path(rest[index + 1])
                index += 2
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown evaluate-gold-set option: {argument}")
            if gold_path_arg is None:
                gold_path_arg = argument
                index += 1
                continue
            raise SystemExit("usage: observatory evaluate-gold-set <gold_path> [--output-json=PATH]")
        if gold_path_arg is None:
            raise SystemExit("usage: observatory evaluate-gold-set <gold_path> [--output-json=PATH]")
        try:
            report = evaluate_gold_set(Path(gold_path_arg))
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc
        rendered = json.dumps(report, indent=2, ensure_ascii=False)
        if output_json_path is not None:
            output_json_path.parent.mkdir(parents=True, exist_ok=True)
            output_json_path.write_text(rendered + "\n", encoding="utf-8", newline="\n")
        print(rendered)
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
        jurisdiction = None
        reset_jurisdiction_analyses = False
        dry_run = False
        force = False
        max_delete_ratio = 0.20
        for argument in rest:
            if argument == "--reset-jurisdiction-analyses":
                reset_jurisdiction_analyses = True
                continue
            if argument == "--dry-run":
                dry_run = True
                continue
            if argument == "--force":
                force = True
                continue
            if argument.startswith("--max-delete-ratio="):
                try:
                    max_delete_ratio = float(argument.split("=", 1)[1])
                except ValueError as exc:
                    raise SystemExit("sync-db-to-source-manifests --max-delete-ratio must be a float") from exc
                continue
            if argument.startswith("--"):
                raise SystemExit(f"unknown sync-db-to-source-manifests option: {argument}")
            if jurisdiction is not None:
                raise SystemExit(
                    "usage: observatory sync-db-to-source-manifests [jurisdiction] [--reset-jurisdiction-analyses] [--dry-run] [--max-delete-ratio=F] [--force]"
                )
            jurisdiction = argument
        try:
            result = sync_database_to_source_manifests(
                jurisdiction=jurisdiction,
                reset_jurisdiction_analyses=reset_jurisdiction_analyses,
                dry_run=dry_run,
                max_delete_ratio=max_delete_ratio,
                force=force,
            )
        except ValueError as exc:
            raise SystemExit(str(exc)) from exc

        deleted_document_ids = result["deleted_document_ids"]
        mode = "dry-run" if result["dry_run"] else "applied"
        print(
            f"sync-db-to-source-manifests ({mode}): "
            f"kept={result['kept_document_count']} "
            f"deleted={len(deleted_document_ids)} "
            f"jurisdictions={','.join(result['scoped_jurisdictions'])}"
        )
        if deleted_document_ids:
            prefix = "would delete" if result["dry_run"] else "deleted"
            for document_id in deleted_document_ids:
                print(f"{prefix} {document_id}")
        if result["reset_jurisdiction_analyses"]:
            print("reset machine_jurisdiction_analyses")
        return
    raise SystemExit(f"unknown command: {command}")


if __name__ == "__main__":
    app()
