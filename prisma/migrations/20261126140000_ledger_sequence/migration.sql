-- Append order for the hash-chained ledger (timestamps can tie).
ALTER TABLE "audit_logs" ADD COLUMN "seq" SERIAL NOT NULL;
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");
