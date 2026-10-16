-- One destination per form. Two concurrent first publishes could otherwise both insert one;
-- with this index the second publish fails as a whole and reports a conflict.
DROP INDEX destinations_form;
CREATE UNIQUE INDEX destinations_form ON destinations(form_id);
