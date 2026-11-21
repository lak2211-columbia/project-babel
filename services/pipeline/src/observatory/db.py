from __future__ import annotations

import hashlib
import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import connect
from psycopg.types.json import Jsonb

from observatory.persistence import (
    AnalysisPersistenceBundle,
    JurisdictionAnalysisPersistenceBundle,
)
from observatory.source_registry import ROOT, load_all_source_manifests


MIGRATIONS_DIR = ROOT / "sql" / "migrations"
MIGRATION_SPLIT_MARKER = "-- statement-break"
MIGRATION_ADVISORY_LOCK_KEY = 742918273


class PostgresAnalysisStore:
    def __init__(self, database_url: str | None = None) -> None:
        self.database_url = database_url or os.getenv("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL is required")
        self._conn = None

    def __enter__(self) -> "PostgresAnalysisStore":
        if self._conn is None:
            self._conn = connect(self.database_url)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if self._conn is not None:
            try:
                if exc_type is not None:
                    self._conn.rollback()
            finally:
                self._conn.close()
                self._conn = None

    @contextmanager
    def _transaction_cursor(self) -> Iterator:
        if self._conn is not None:
            with self._conn.transaction():
                with self._conn.cursor() as cur:
                    yield cur
            return

        with connect(self.database_url) as conn:
            with conn.cursor() as cur:
                yield cur

    def persist_analysis_bundle(self, bundle: AnalysisPersistenceBundle) -> None:
        with self._transaction_cursor() as cur:
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
                    effective_date,
                    publication_date_precision,
                    content_sha256,
                    binding_strength,
                    source_tier,
                    corpus_role,
                    lifecycle_stage,
                    raw_metadata,
                    raw_artifact_path,
                    normalized_text_path,
                    normalized_text,
                    sections_json,
                    parser_warnings_json,
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
                    %(effective_date)s,
                    %(publication_date_precision)s,
                    %(content_sha256)s,
                    %(binding_strength)s,
                    %(source_tier)s,
                    %(corpus_role)s,
                    %(lifecycle_stage)s,
                    %(raw_metadata)s,
                    %(raw_artifact_path)s,
                    %(normalized_text_path)s,
                    %(normalized_text)s,
                    %(sections_json)s,
                    %(parser_warnings_json)s,
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
                    effective_date = EXCLUDED.effective_date,
                    publication_date_precision = EXCLUDED.publication_date_precision,
                    content_sha256 = EXCLUDED.content_sha256,
                    binding_strength = EXCLUDED.binding_strength,
                    source_tier = EXCLUDED.source_tier,
                    corpus_role = EXCLUDED.corpus_role,
                    lifecycle_stage = EXCLUDED.lifecycle_stage,
                    raw_metadata = EXCLUDED.raw_metadata,
                    raw_artifact_path = EXCLUDED.raw_artifact_path,
                    normalized_text_path = EXCLUDED.normalized_text_path,
                    normalized_text = EXCLUDED.normalized_text,
                    sections_json = EXCLUDED.sections_json,
                    parser_warnings_json = EXCLUDED.parser_warnings_json,
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
                    "effective_date": bundle.effective_date,
                    "publication_date_precision": bundle.publication_date_precision,
                    "content_sha256": bundle.content_sha256,
                    "binding_strength": bundle.binding_strength,
                    "source_tier": bundle.source_tier,
                    "corpus_role": bundle.corpus_role,
                    "lifecycle_stage": bundle.lifecycle_stage,
                    "raw_metadata": Jsonb(bundle.raw_metadata),
                    "raw_artifact_path": bundle.raw_artifact_path,
                    "normalized_text_path": bundle.normalized_text_path,
                    "normalized_text": bundle.normalized_text,
                    "sections_json": Jsonb(bundle.sections),
                    "parser_warnings_json": Jsonb(bundle.parser_warnings),
                    "parser_version": bundle.parser_version,
                },
            )
            cur.execute(
                """
                INSERT INTO document_snapshots (
                    document_id,
                    content_sha256,
                    parser_version,
                    title,
                    publication_date,
                    effective_date,
                    normalized_text,
                    sections_json,
                    raw_metadata
                )
                VALUES (
                    %(document_id)s,
                    %(content_sha256)s,
                    %(parser_version)s,
                    %(title)s,
                    %(publication_date)s,
                    %(effective_date)s,
                    %(normalized_text)s,
                    %(sections_json)s,
                    %(raw_metadata)s
                )
                ON CONFLICT (document_id, content_sha256, parser_version) DO NOTHING
                """,
                {
                    "document_id": bundle.document_id,
                    "content_sha256": bundle.content_sha256,
                    "parser_version": bundle.parser_version,
                    "title": bundle.title,
                    "publication_date": bundle.publication_date,
                    "effective_date": bundle.effective_date,
                    "normalized_text": bundle.normalized_text,
                    "sections_json": Jsonb(bundle.sections),
                    "raw_metadata": Jsonb(bundle.raw_metadata),
                },
            )
            cur.execute(
                """
                INSERT INTO machine_document_analyses (
                    document_id,
                    analysis_fingerprint,
                    content_sha256,
                    taxonomy_version,
                    grounding_ratio,
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
                    frame_shares_json,
                    analyzed_at,
                    updated_at
                )
                VALUES (
                    %(document_id)s,
                    %(analysis_fingerprint)s,
                    %(content_sha256)s,
                    %(taxonomy_version)s,
                    %(grounding_ratio)s,
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
                    %(frame_shares_json)s,
                    %(analyzed_at)s,
                    NOW()
                )
                ON CONFLICT (analysis_fingerprint) DO UPDATE SET
                    content_sha256 = EXCLUDED.content_sha256,
                    taxonomy_version = EXCLUDED.taxonomy_version,
                    grounding_ratio = EXCLUDED.grounding_ratio,
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
                    frame_shares_json = EXCLUDED.frame_shares_json,
                    analyzed_at = EXCLUDED.analyzed_at,
                    updated_at = NOW()
                RETURNING id
                """,
                {
                    "document_id": bundle.document_id,
                    "analysis_fingerprint": bundle.analysis_fingerprint,
                    "content_sha256": bundle.content_sha256,
                    "taxonomy_version": bundle.taxonomy_version,
                    "grounding_ratio": bundle.grounding_ratio,
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
                    "frame_shares_json": Jsonb(bundle.frame_shares) if bundle.frame_shares is not None else None,
                    "analyzed_at": bundle.analyzed_at,
                },
            )
            machine_analysis_id = cur.fetchone()[0]
            self._replace_child_rows(cur, machine_analysis_id, bundle)

    def persist_jurisdiction_analysis_bundle(
        self,
        bundle: JurisdictionAnalysisPersistenceBundle,
        *,
        replace_stale_for_jurisdiction: bool = True,
    ) -> None:
        with self._transaction_cursor() as cur:
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
            if replace_stale_for_jurisdiction:
                cur.execute(
                    """
                    DELETE FROM machine_jurisdiction_analyses
                    WHERE jurisdiction = %s
                      AND analysis_fingerprint <> %s
                    """,
                    (bundle.jurisdiction, bundle.analysis_fingerprint),
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

        seen_domains: set[str] = set()
        for domain in bundle.policy_extraction["covered_application_domains"]:
            if domain in seen_domains:
                continue
            seen_domains.add(domain)
            cur.execute(
                """
                INSERT INTO machine_application_domains (machine_analysis_id, label)
                VALUES (%s, %s)
                """,
                (machine_analysis_id, domain),
            )

        seen_requirements: set[str] = set()
        for requirement in bundle.policy_extraction["safety_requirements"]:
            label = requirement["label"]
            if label in seen_requirements:
                continue
            seen_requirements.add(label)
            cur.execute(
                """
                INSERT INTO machine_policy_requirements (
                    machine_analysis_id,
                    label,
                    confidence,
                    obligation_strength,
                    evidence
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    machine_analysis_id,
                    label,
                    requirement["confidence"],
                    requirement.get("obligation_strength"),
                    Jsonb(requirement.get("evidence", [])),
                ),
            )

        seen_mechanisms: set[str] = set()
        for mechanism in bundle.policy_extraction["enforcement_mechanisms"]:
            label = mechanism["label"]
            if label in seen_mechanisms:
                continue
            seen_mechanisms.add(label)
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
                    label,
                    mechanism["confidence"],
                    Jsonb(mechanism.get("evidence", [])),
                ),
            )

        seen_secondary: set[str] = set()
        for frame in bundle.risk_framing["secondary_frames"]:
            if frame in seen_secondary:
                continue
            seen_secondary.add(frame)
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
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_ADVISORY_LOCK_KEY,))
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute(
                "ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT"
            )
            for migration_path in sorted(MIGRATIONS_DIR.glob("[0-9][0-9][0-9]_*.sql")):
                version = migration_path.name
                sql_text = migration_path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(sql_text.encode("utf-8")).hexdigest()
                cur.execute(
                    "SELECT checksum FROM schema_migrations WHERE version = %s",
                    (version,),
                )
                existing = cur.fetchone()
                if existing is not None:
                    recorded_checksum = existing[0]
                    if recorded_checksum is None:
                        cur.execute(
                            "UPDATE schema_migrations SET checksum = %s WHERE version = %s",
                            (checksum, version),
                        )
                    elif recorded_checksum != checksum:
                        raise ValueError(
                            f"migration checksum mismatch for '{version}': "
                            f"recorded={recorded_checksum[:12]} current={checksum[:12]}"
                        )
                    continue

                for statement in _split_migration_statements(sql_text):
                    cur.execute(statement)

                cur.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)",
                    (version, checksum),
                )
                applied.append(version)

    return applied


def sync_database_to_source_manifests(
    database_url: str | None = None,
    *,
    jurisdiction: str | None = None,
    reset_jurisdiction_analyses: bool = False,
    dry_run: bool = False,
    max_delete_ratio: float = 0.20,
    force: bool = False,
) -> dict[str, object]:
    resolved_database_url = database_url or os.getenv("DATABASE_URL")
    if not resolved_database_url:
        raise ValueError("DATABASE_URL is required")
    if max_delete_ratio < 0.0 or max_delete_ratio > 1.0:
        raise ValueError("max_delete_ratio must be between 0.0 and 1.0")

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

            delete_ratio = (
                len(stale_document_ids) / len(existing_document_ids)
                if existing_document_ids
                else 0.0
            )
            if stale_document_ids and delete_ratio > max_delete_ratio and not force and not dry_run:
                raise ValueError(
                    f"refusing to delete {len(stale_document_ids)}/{len(existing_document_ids)} "
                    f"documents ({delete_ratio:.1%} > max_delete_ratio={max_delete_ratio:.1%}); "
                    "pass --dry-run to inspect or --force to override"
                )

            if not dry_run:
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
        "existing_document_count": len(existing_document_ids),
        "deleted_document_ids": stale_document_ids,
        "delete_ratio": round(delete_ratio, 4),
        "dry_run": dry_run,
        "reset_jurisdiction_analyses": reset_jurisdiction_analyses and not dry_run,
    }


def _has_executable_sql(statement: str) -> bool:
    for raw_line in statement.splitlines():
        line = raw_line.strip()
        if line and not line.startswith("--"):
            return True
    return False


def _split_migration_statements(sql_text: str) -> list[str]:
    return [
        statement.strip()
        for statement in sql_text.split(MIGRATION_SPLIT_MARKER)
        if statement.strip() and _has_executable_sql(statement)
    ]
