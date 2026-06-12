-- Create delivery agent wallets/bonuses/payouts tables

CREATE TABLE IF NOT EXISTS coexistence.delivery_agent_bonuses (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT REFERENCES coexistence.delivery_agents(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coexistence.delivery_agent_payouts (
    id BIGSERIAL PRIMARY KEY,
    agent_id BIGINT REFERENCES coexistence.delivery_agents(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
