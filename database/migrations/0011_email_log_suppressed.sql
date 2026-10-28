-- Test requests (header X-Test-No-Mail, only when APP_ENV=local) must not use up the real mailbox quota.
-- Their emails are saved to storage/logs/outbox and logged as SUPPRESSED.

ALTER TABLE email_log MODIFY status ENUM('SENT','FAILED','SUPPRESSED') NOT NULL;
