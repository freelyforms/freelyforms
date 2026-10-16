-- When a delivery's encrypted payload was put in the hold store (ADR 0011, ADR 0014); NULL when
-- it is not held. Resuming and the hourly sweep find held deliveries by this column, not by state.
ALTER TABLE deliveries ADD COLUMN held_at INTEGER;
CREATE INDEX deliveries_held ON deliveries(destination_id, held_at) WHERE held_at IS NOT NULL;
