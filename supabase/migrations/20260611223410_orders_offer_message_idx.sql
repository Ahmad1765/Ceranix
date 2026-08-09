-- Covering index for the orders.offer_message_id foreign key (advisor lint 0001).
create index orders_offer_message_idx on public.orders(offer_message_id) where offer_message_id is not null;
