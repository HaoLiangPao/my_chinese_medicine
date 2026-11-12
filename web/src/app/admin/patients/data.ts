/** admin_patient_accounts 返回的一行：只有数字，没有用了哪些药（docs/design/0015 §4.3） */
export type PatientAccount = {
  user_id: string;
  user_no: number;
  members: number;
  prescriptions: number;
  prescriptions_total: number;
  herbs: number;
  decoctions: number;
  active_days: number;
  last_on: string | null;
  is_me: boolean;
};
