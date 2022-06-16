
import { TraderAccount } from "./TraderAccount";
import { Order } from "./Order";
import { OrderPlacement } from "./OrderPlacement";

export type PairAccount = [TraderAccount, TraderAccount];
export type PairBitOrder = [BitOrder, BitOrder];
export type PairOrder = [Order, Order];
export type StringBoolNull = string | boolean | null;
export type AccountOrderPlacement = [TraderAccount, OrderPlacement];
