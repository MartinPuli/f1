-- Run once in a Neon database. Re-running this file leaves existing races intact.
CREATE TABLE IF NOT EXISTS jevrace_races (
  owner text NOT NULL,
  id uuid NOT NULL,
  created bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL,
  recording jsonb NOT NULL,
  PRIMARY KEY (owner, id)
);
CREATE INDEX IF NOT EXISTS jevrace_races_owner_created ON jevrace_races (owner, created DESC);
CREATE INDEX IF NOT EXISTS jevrace_races_updated ON jevrace_races (updated_at);
CREATE TABLE IF NOT EXISTS jevrace_limits (
  bucket text PRIMARY KEY,
  window_start bigint NOT NULL,
  count integer NOT NULL
);

-- Serialize saves for one owner so concurrent requests can't bypass the quota.
CREATE OR REPLACE FUNCTION save_jevrace(p_owner text, p_id uuid, p_created bigint, p_metadata jsonb, p_recording jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE total_count integer; total_bytes bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner, 0));
  SELECT count(*), COALESCE(sum(octet_length(recording::text)), 0)
    INTO total_count, total_bytes FROM jevrace_races WHERE owner = p_owner AND id <> p_id;
  IF total_count >= 50 OR total_bytes + octet_length(p_recording::text) > 50000000 THEN
    RETURN false;
  END IF;
  INSERT INTO jevrace_races(owner, id, created, metadata, recording)
    VALUES(p_owner, p_id, p_created, p_metadata, p_recording)
    ON CONFLICT(owner, id) DO UPDATE SET metadata = excluded.metadata,
      recording = excluded.recording, updated_at = now();
  RETURN true;
END;
$$;
