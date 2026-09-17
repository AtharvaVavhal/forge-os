-- PostgreSQL full-text search indexes (Doc 2 §E). Sufficient at stated volume; no Elasticsearch.

CREATE INDEX companies_name_fts_idx
  ON companies USING GIN (to_tsvector('english', coalesce(name, '')));

CREATE INDEX contacts_name_email_fts_idx
  ON contacts USING GIN (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(email, ''))
  );

CREATE INDEX deals_title_fts_idx
  ON deals USING GIN (to_tsvector('english', coalesce(title, '')));

CREATE INDEX projects_name_fts_idx
  ON projects USING GIN (to_tsvector('english', coalesce(name, '')));

CREATE INDEX invoices_number_fts_idx
  ON invoices USING GIN (to_tsvector('english', coalesce(invoice_number, '')));

CREATE INDEX tasks_title_fts_idx
  ON tasks USING GIN (to_tsvector('english', coalesce(title, '')));
