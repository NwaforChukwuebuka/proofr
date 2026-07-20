-- Milestone 23: fixes the consent gap flagged when milestone 22 shipped.
-- GET /api/public/score now only returns a merchant who has explicitly
-- granted consent — null means "never asked," not "opted out of something
-- they were opted into by default." Existing merchants are NOT retroactively
-- exposed: this column defaults to null, so nobody becomes publicly
-- queryable without taking an affirmative action after this migration runs.

alter table merchants
  add column public_api_consent_at timestamptz;
