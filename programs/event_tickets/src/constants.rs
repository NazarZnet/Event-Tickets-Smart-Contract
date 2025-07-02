use anchor_lang::constant;

pub const DISCRIMINATOR_LENGHT: usize = 8;

#[constant]
pub const EVENT_COUNTER_SEED: &[u8] = "event_counter".as_bytes();

#[constant]
pub const EVENT_SEED: &[u8] = "event".as_bytes();
