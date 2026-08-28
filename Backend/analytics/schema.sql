CREATE TABLE IF NOT EXISTS reading_events (
  event_id UUID, occurred_at DateTime64(3), event_name LowCardinality(String),
  student_id UUID, classroom_id UUID, teacher_id UUID, book_id Nullable(UUID),
  recommendation_batch_id Nullable(UUID), page_number Nullable(UInt16),
  feeling LowCardinality(Nullable(String)), friction_type LowCardinality(Nullable(String)), properties JSON
) ENGINE = MergeTree PARTITION BY toYYYYMM(occurred_at) ORDER BY (classroom_id, student_id, occurred_at, event_id);
