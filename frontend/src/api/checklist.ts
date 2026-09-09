import api from '@/api/client';
import type { VehicleChecklist } from '@/types/api';

// ── Pre-dispatch vehicle equipment checklist ────────────────────────────────
// Crew (driver/EMT/nurse currently checked into the vehicle) confirm each
// active+required InventoryItem is present each shift; dispatchers/admins can
// view any vehicle's checklist read-only before assigning it to a case.

export async function getVehicleChecklist(vehicleId: string): Promise<VehicleChecklist> {
  const res = await api.get(`/fleet/${vehicleId}/checklist`);
  return res.data.data as VehicleChecklist;
}

export async function submitChecklistItem(
  vehicleId: string,
  data: { itemId: string; status: 'OK' | 'ISSUE'; note?: string }
): Promise<void> {
  await api.post(`/fleet/${vehicleId}/checklist`, data);
}
