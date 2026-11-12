/** admin_doctors 返回的一行（docs/design/0015 §4） */
export type Doctor = {
  user_id: string;
  user_no: number;
  email: string;
  /** 病人数：1–4 是 null（显示「<5」） */
  patients_total: number | null;
  patients_new: number | null;
  patients_seen: number | null;
  prescriptions: number;
  prescriptions_total: number;
  decoctions: number;
  consumed_grams: number;
  last_on: string | null;
};
