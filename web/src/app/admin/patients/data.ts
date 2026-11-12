/** admin_patient_accounts 返回的一行：只有数字，没有用了哪些药（docs/design/0015 §4.3）。数字 1–4 是 null（显示「<5」） */
export type PatientAccount = {
  user_id: string;
  user_no: number;
  members: number | null;
  prescriptions: number | null;
  prescriptions_total: number | null;
  herbs: number | null;
  decoctions: number | null;
  active_days: number | null;
  last_on: string | null;
  is_me: boolean;
};
