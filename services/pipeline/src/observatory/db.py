from __future__ import annotations

import os
from pathlib import Path

from psycopg import connect
from psycopg.types.json import Jsonb

from observatory.persistence import (
    AnalysisPersistenceBundle,
    JurisdictionAnalysisPersistenceBundle,
)
from observatory.source_registry import ROOT, load_all_source_manifests


MIGRATIONS_DIR = ROOT / "sql" / "migrations"
MIGRATION_SPLIT_MARKER = "-- statement-break"


class PostgresAnalysisStore:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or os.getenv("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL is required")

    def persist_analysis_bundle(self, bundle: AnalysisPersistenceBundle) -> None:
        with connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO documents (
                        id,
                        jurisdiction,
                        title,
                        canonical_url,
                        issuing_body_hint,
                        language,
                        publication_date,
                        raw_metadata,
                        raw_artifact_path,
                        normalized_text_path,
                        normalized_text,
                        parser_version,
                        updated_at
                    )
                    VALUES (
                        %(id)s,
                        %(jurisdiction)s,
                        %(title)s,
                        %(canonical_url)s,
                        %(issuing_body_hint)s,
                        %(language)s,
                        %(publication_date)s,
                        %(raw_metadata)s,
                        %(raw_artifact_path)s,
                        %(normalized_text_path)s,
                        %(normalized_text)s,
                        %(parser_version)s,
                        NOW()
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        jurisdiction = EXCLUDED.jurisdiction,
                        title = EXCLUDED.title,
                        canonical_url = EXCLUDED.canonical_url,
                        issuing_body_hint = EXCLUDED.issuing_body_hint,
                        language = EXCLUDED.language,
                        publication_date = EXCLUDED.publication_date,
                        raw_metadata = EXCLUDED.raw_metadata,
                        raw_artifact_path = EXCLUDED.raw_artifact_path,
                        normalized_text_path = EXCLUDED.normalized_text_path,
                        normalized_text = EXCLUDED.normalized_text,
                        parser_version = EXCLUDED.parser_version,
                        updated_at = NOW()
                    """,
                    {
                        "id": bundle.document_id,
                        "jurisdiction": bundle.jurisdiction,
                        "title": bundle.title,
                        "canonical_url": bundle.canonical_url,
                        "issuing_body_hint": bundle.issuing_body,
                        "language": bundle.language,
                        "publication_date": bundle.publication_date,
                        "raw_metadata": Jsonb(bundle.raw_metadata),
                        "raw_artifact_path": bundle.raw_artifact_path,
                        "normalized_text_path": bundle.normalized_text_path,
                        "normalized_text": bundle.normalized_text,
                        "parser_version": bundle.parser_version,
                    },
                )
                cur.execute(
                    """
                    INSERT INTO machine_document_analyses (
                        document_id,
                        analysis_fingerprint,
                        provider,
                        model,
                        effort,
                        analysis_version,
                        taxonomy_hash,
                        extraction_prompt_hash,
                        framing_prompt_hash,
                        policy_extraction,
                        risk_framing,
                        raw_policy_response,
                        raw_framing_response,
                        overall_confidence,
                        dominant_frame_confidence,
                        updated_at
                    )
                    VALUES (
                        %(document_id)s,
                        %(analysis_fingerprint)s,
                        %(provider)s,
                        %(model)s,
                        %(effort)s,
                        %(analysis_version)s,
                        %(taxonomy_hash)s,
                        %(extraction_prompt_hash)s,
                        %(framing_prompt_hash)s,
                        %(policy_extraction)s,
                        %(risk_framing)s,
                        %(raw_policy_response)s,
                        %(raw_framing_response)s,
                        %(overall_confidence)s,
                        %(dominant_frame_confidence)s,
                        NOW()
                    )
                    ON CONFLICT (analysis_fingerprint) DO UPDATE SET
                        provider = EXCLUDED.provider,
                        model = EXCLUDED.model,
                        effort = EXCLUDED.effort,
                        analysis_version = EXCLUDED.analysis_version,
                        taxonomy_hash = EXCLUDED.taxonomy_hash,
                        extraction_prompt_hash = EXCLUDED.extraction_prompt_hash,
                        framing_prompt_hash = EXCLUDED.framing_prompt_hash,
                        policy_extraction = EXCLUDED.policy_extraction,
                        risk_framing = EXCLUDED.risk_framing,
                        raw_policy_response = EXCLUDED.raw_policy_response,
                        raw_framing_response = EXCLUDED.raw_framing_response,
                        overall_confidence = EXCLUDED.overall_confidence,
                        dominant_frame_confidence = EXCLUDED.dominant_frame_confidence,
                        updated_at = NOW()
                    RETURNING id
                    """,
                    {
                        "document_id": bundle.document_id,
                        "analysis_fingerprint": bundle.analysis_fingerprint,
                        "provider": bundle.provider,
                        "model": bundle.model,
                        "effort": bundle.effort,
                        "analysis_version": bundle.analysis_version,
                        "taxonomy_hash": bundle.taxonomy_hash,
                        "extraction_prompt_hash": bundle.extraction_prompt_hash,
                        "framing_prompt_hash": bundle.framing_prompt_hash,
                        "policy_extraction": Jsonb(bundle.policy_extraction),
                        "risk_framing": Jsonb(bundle.risk_framing),
                        "raw_policy_response": Jsonb(bundle.raw_policy_response),
                        "raw_framing_response": Jsonb(bundle.raw_framing_response),
                        "overall_confidence": bundle.overall_confidence,
                        "dominant_frame_confidence": bundle.dominant_frame_confidence,
                    },
                )
                machine_analysis_id = cur.fetchone()[0]
                self._replace_child_rows(cur, machine_analysis_id, bundle)

    def persist_jurisdiction_analysis_bundle(
        self,
        bundle: JurisdictionAnalysisPersistenceBundle,
    ) -> None:
        with connect(self.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO machine_jurisdiction_analyses (
                        jurisdiction,
                        analysis_fingerprint,
                        analysis_version,
                        analysis_method,
                        taxonomy_hash,
                        source_document_count,
                        source_document_ids,
                        source_window_start,
                        source_window_end,
                        analysis_payload,
                        input_digest,
                        overall_confidence,
                        updated_at
                    )
                    VALUES (
                        %(jurisdiction)s,
                        %(analysis_fingerprint)s,
                        %(analysis_version)s,
                        %(analysis_method)s,
                        %(taxonomy_hash)s,
                        %(source_document_count)s,
                        %(source_document_ids)s,
                        %(source_window_start)s,
                        %(source_window_end)s,
                        %(analysis_payload)s,
                        %(input_digest)s,
                        %(overall_confidence)s,
                        NOW()
                    )
                    ON CONFLICT (analysis_fingerprint) DO UPDATE SET
                        analysis_version = EXCLUDED.analysis_version,
                        analysis_method = EXCLUDED.analysis_method,
                        taxonomy_hash = EXCLUDED.taxonomy_hash,
                        source_document_count = EXCLUDED.source_document_count,
                        source_document_ids = EXCLUDED.source_document_ids,
                        source_window_start = EXCLUDED.source_window_start,
                        source_window_end = EXCLUDED.source_window_end,
                        analysis_payload = EXCLUDED.analysis_payload,
                        input_digest = EXCLUDED.input_digest,
                        overall_confidence = EXCLUDED.overall_confidence,
                        updated_at = NOW()
                    """,
                    {
                        "jurisdiction": bundle.jurisdiction,
                        "analysis_fingerprint": bundle.analysis_fingerprint,
                        "analysis_version": bundle.analysis_version,
                        "analysis_method": bundle.analysis_method,
                        "taxonomy_hash": bundle.taxonomy_hash,
                        "source_document_count": bundle.source_document_count,
                        "source_document_ids": Jsonb(bundle.source_document_ids),
                        "source_window_start": bundle.source_window_start,
                        "source_window_end": bundle.source_window_end,
                        "analysis_payload": Jsonb(bundle.analysis_payload),
                        "input_digest": Jsonb(bundle.input_digest),
                        "overall_confidence": bundle.overall_confidence,
                    },
                )

    def _replace_child_rows(self, cur, machine_analysis_id: int, bundle: AnalysisPersistenceBundle) -> None:
        cur.execute(
            "DELETE FROM machine_policy_requirements WHERE machine_analysis_id = %s",
            (machine_analysis_id,),
        )
        cur.execute(
            "DELETE FROM machine_enforcement_mechanisms WHERE machine_analysis_id = %s",
            (machine_analysis_id,),
        )
        cur.execute(
            "DELETE FROM machine_application_domains WHERE machine_analysis_id = %s",
            (machine_analysis_id,),
        )
        cur.execute(
            "DELETE FROM machine_secondary_frames WHERE machine_analysis_id = %s",
            (machine_analysis_id,),
        )
        cur.execute(
            "DELETE FROM machine_frame_scores WHERE machine_analysis_id = %s",
            (machine_analysis_id,),
        )
        for domain in bundle.policy_extraction["covered_application_domains"]:
            cur.execute(
                """
                INSERT INTO machine_application_domains (machine_analysis_id, label)
                VALUES (%s, %s)
                """,
                (machine_analysis_id, domain),
            )

        for requirement in bundle.policy_extraction["safety_requirements"]:
            cur.execute(
                """
                INSERT INTO machine_policy_requirements (
                    machine_analysis_id,
                    label,
                    confidence,
                    evidence
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    machine_analysis_id,
                    requirement["label"],
                    requirement["confidence"],
                    Jsonb(requirement.get("evidence", [])),
                ),
            )

        for mechanism in bundle.policy_extraction["enforcement_mechanisms"]:
            cur.execute(
                """
                INSERT INTO machine_enforcement_mechanisms (
                    machine_analysis_id,
                    label,
                    confidence,
                    evidence
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    machine_analysis_id,
                    mechanism["label"],
                    mechanism["confidence"],
                    Jsonb(mechanism.get("evidence", [])),
                ),
            )

        for frame in bundle.risk_framing["secondary_frames"]:
            cur.execute(
                """
                INSERT INTO machine_secondary_frames (machine_analysis_id, frame)
                VALUES (%s, %s)
                """,
                (machine_analysis_id, frame),
            )

        for frame, score in bundle.risk_framing["frame_confidence"].items():
            cur.execute(
                """
                INSERT INTO machine_frame_scores (machine_analysis_id, frame, score)
                VALUES (%s, %s, %s)
                """,
                (machine_analysis_id, frame, score),
            )


def apply_sql_migrations(database_url: str | None = None) -> list[str]:
    resolved_database_url = database_url or os.getenv("DATABASE_URL")
    if not resolved_database_url:
        raise ValueError("DATABASE_URL is required")

    applied: list[str] = []
    with connect(resolved_database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            for migration_path in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql")):
                version = migration_path.name
                cur.execute(
                    "SELECT 1 FROM schema_migrations WHERE version = %s",
                    (version,),
                )
                if cur.fetchone():
                    continue

                for statement in _split_migration_statements(migration_path.read_text(encoding="utf-8")):
                    cur.execute(statement)

                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,),
                )
                applied.append(version)

    return applied


def sync_database_to_source_manifests(
    database_url: str | None = None,
    *,
    jurisdiction: str | None = None,
    reset_jurisdiction_analyses: bool = False,
) -> dict[str, object]:
    resolved_database_url = database_url or os.getenv("DATABASE_URL")
    if not resolved_database_url:
        raise ValueError("DATABASE_URL is required")

    manifests = load_all_source_manifests()
    if jurisdiction is not None:
        manifests = [manifest for manifest in manifests if manifest.jurisdiction == jurisdiction]
        if not manifests:
            raise ValueError(f"unknown jurisdiction: {jurisdiction}")

    keep_document_ids = sorted(
        {
            document.id
            for manifest in manifests
            for document in manifest.seed_documents
        }
    )
    scoped_jurisdictions = sorted({manifest.jurisdiction for manifest in manifests})

    with connect(resolved_database_url) as conn:
        with conn.cursor() as cur:
            if jurisdiction is None:
                cur.execute("SELECT id FROM documents")
            else:
                cur.execute(
                    "SELECT id FROM documents WHERE jurisdiction = %s",
                    (jurisdiction,),
                )
            existing_document_ids = sorted(row[0] for row in cur.fetchall())
            stale_document_ids = sorted(set(existing_document_ids) - set(keep_document_ids))

            if stale_document_ids:
                cur.execute(
                    "DELETE FROM documents WHERE id = ANY(%s)",
                    (stale_document_ids,),
                )

            if reset_jurisdiction_analyses:
                if jurisdiction is None:
                    cur.execute("DELETE FROM machine_jurisdiction_analyses")
                else:
                    cur.execute(
                        "DELETE FROM machine_jurisdiction_analyses WHERE jurisdiction = %s",
                        (jurisdiction,),
                    )

    return {
        "jurisdiction": jurisdiction,
        "scoped_jurisdictions": scoped_jurisdictions,
        "kept_document_count": len(keep_document_ids),
        "deleted_document_ids": stale_document_ids,
        "reset_jurisdiction_analyses": reset_jurisdiction_analyses,
    }


def _split_migration_statements(sql_text: str) -> list[str]:
    return [
        statement.strip()
        for statement in sql_text.split(MIGRATION_SPLIT_MARKER)
        if statement.strip()
    ]
