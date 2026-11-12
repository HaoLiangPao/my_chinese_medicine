/** admin_doctors 返回的一行（docs/design/0015 §4） */
export type Doctor = {
  user_id: string;
  user_no: number;
  email: string;
  patients_total: number;
  patients_new: number;
  patients_seen: number;
  prescriptions: number;
  prescriptions_total: number;
  decoctions: number;
  consumed_grams: number;
  last_on: string | null;
};
