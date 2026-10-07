// Row shapes shared by the Sessions & flights screen's parts (the schedule editor, the team
// board and the roster board), so the page builds them once and every part reads the same type.

export type PlatformOption = { id: string; name: string };

export type SessionRow = {
  id: string;
  name: string;
  session_date: string | null;
  weigh_in_time: string | null;
  lift_off_time: string | null;
  platform_id: string | null;
  sort_order: number;
};

export type FlightRow = { id: string; session_id: string; name: string; sort_order: number };

export type BoardEntry = {
  id: string;
  flight_id: string | null;
  lot_number: number | null;
  opener_kg: number | null;
  weight_class_name: string | null;
  lifter_name: string;
};
