import type { Order } from "../orders";

export type StartResult =
  | { type: "redirect"; url: string }
  | { type: "html"; html: string }
  | { type: "manual" }
  | { type: "error"; message: string };

export type ReturnResult = { orderId: string; paid: boolean; ref: string | null; message?: string };

export interface PaymentProvider {
  id: string;
  label: string;
  description: string;
  configured(): boolean;
  start(order: Order, eventName: string): Promise<StartResult>;
  /** Handles the browser return / webhook from the provider. Must verify authenticity. */
  handleReturn?(req: Request): Promise<ReturnResult>;
}
