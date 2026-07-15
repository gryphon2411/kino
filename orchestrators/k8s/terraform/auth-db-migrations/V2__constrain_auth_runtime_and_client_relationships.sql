-- V1 initially granted runtime DML on every table in kino_auth, including
-- Flyway's migration ledger. Keep the Auth Service limited to protocol state
-- while the migrator remains the only schema/history owner.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA kino_auth FROM kino_auth_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kino_auth FROM kino_auth_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE oauth2_registered_client, oauth2_authorization, oauth2_authorization_consent
  TO kino_auth_runtime;

-- Authorization and consent rows are meaningless without their registered
-- client. Restrict client removal instead of cascading active protocol state.
ALTER TABLE oauth2_authorization
  ADD CONSTRAINT oauth2_authorization_registered_client_fk
  FOREIGN KEY (registered_client_id) REFERENCES oauth2_registered_client (id)
  ON DELETE RESTRICT;

ALTER TABLE oauth2_authorization_consent
  ADD CONSTRAINT oauth2_authorization_consent_registered_client_fk
  FOREIGN KEY (registered_client_id) REFERENCES oauth2_registered_client (id)
  ON DELETE RESTRICT;
