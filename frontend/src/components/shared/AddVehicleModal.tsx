import { useState } from 'react';
import {
  X,
  Truck,
  IdCard as IdentificationCard,
  RadioTower as Broadcast,
  Globe,
  Toolbox,
  UsersRound as UsersThree,
  Fuel as GasPump,
  Zap as Lightning,
  Info,
  CircleAlert as WarningCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { Agency } from '@/types/api';
import { useNotificationStore } from '@/stores/notificationStore';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function AddVehicleModal({ isOpen, onClose }: AddVehicleModalProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  
  const [formData, setFormData] = useState({
    registrationNumber: '',
    imei: '',
    agencyId: '',
    equipmentLevel: 'ADVANCED',
    crewCapacity: '3',
  });

  const { data: agencies } = useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: async () => {
      const res = await api.get<{ data: Agency[] }>('/admin/agencies');
      return res.data.data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.post('/admin/vehicles', {
        registrationNumber: data.registrationNumber,
        imei: data.imei,
        agencyId: data.agencyId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      addNotification({
        type: 'success',
        title: 'Tactical Unit Activated',
        message: `Unit ${formData.registrationNumber} is now live on the grid.`,
      });
      onClose();
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Registration Failed',
        message: err?.response?.data?.message || 'Could not register unit. Please try again.',
      });
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dynamic Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      ></div>

      {/* Professional Command Modal */}
      <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/20">
        
        <div className="bg-brand-sidebar p-6 flex justify-between items-center border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="bg-brand-green p-2.5 rounded-xl">
              <Truck size={22} className="text-black" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg leading-none">Add Vehicle</h3>
              <p className="text-slate-400 text-xs mt-1">Register a new fleet unit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
          >
            <X size={24} className="group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <form 
          className="p-10 flex flex-col gap-8 bg-gradient-to-b from-white to-slate-50/50"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(formData);
          }}
        >
          {/* Form Content in Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            
            {/* Core Identification */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Info size={16} className="text-brand-teal" />
                <h4 className="text-[11px] font-black text-slate-900 tracking-widest">Identification Data</h4>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1">
                    <IdentificationCard size={14} /> Registration Number
                  </label>
                  <input 
                    required
                    type="text" 
                    placeholder="e.g. KCA 123X"
                    value={formData.registrationNumber}
                    onChange={(e) => setFormData({...formData, registrationNumber: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-black text-brand-teal focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1">
                    <Broadcast size={14} /> Telemetry IMEI
                  </label>
                  <input 
                    required
                    type="text" 
                    placeholder="15-digit hardware ID"
                    value={formData.imei}
                    onChange={(e) => setFormData({...formData, imei: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-bold text-slate-500 focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* Tactical Configuration */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Lightning size={16} className="text-brand-green" />
                <h4 className="text-[11px] font-black text-slate-900 tracking-widest">Tactical Config</h4>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1">
                      <Globe size={14} /> Authority
                    </label>
                    <select
                      required
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-sans text-xs font-black text-brand-teal outline-none focus:ring-4 focus:ring-brand-teal/10 appearance-none shadow-sm"
                      value={formData.agencyId}
                      onChange={(e) => setFormData({...formData, agencyId: e.target.value})}
                    >
                      <option value="">Select agency...</option>
                      {agencies?.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1">
                      <Toolbox size={14} /> Equipment
                    </label>
                    <select 
                      className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-sans text-xs font-black text-brand-teal outline-none focus:ring-4 focus:ring-brand-teal/10 appearance-none shadow-sm"
                      value={formData.equipmentLevel}
                      onChange={(e) => setFormData({...formData, equipmentLevel: e.target.value})}
                    >
                      <option value="BASIC">BASIC (BLS)</option>
                      <option value="ADVANCED">ADVANCED (ALS)</option>
                      <option value="CRITICAL">ICU / CRITICAL</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 tracking-widest mb-2.5 ml-1">
                    <UsersThree size={14} /> Operational Crew Capacity
                  </label>
                  <div className="flex gap-3">
                    {['2', '3', '4', '5'].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData({...formData, crewCapacity: num})}
                        className={`flex-1 py-3 rounded-xl font-black text-sm transition-all border ${
                          formData.crewCapacity === num 
                          ? 'bg-brand-teal text-white border-brand-teal shadow-md shadow-brand-teal/20' 
                          : 'bg-white text-slate-400 border-slate-200 hover:border-brand-teal/50'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                   <WarningCircle size={20} className="text-amber-500 shrink-0" />
                   <p className="text-[10px] font-bold text-amber-700 leading-relaxed tracking-tight">
                     Initial commissioning requires full telemetry sync. Unit will be set to <span className="underline">READY</span> status by default.
                   </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3">
               <div className="bg-slate-100 p-2 rounded-lg">
                 <GasPump size={18} className="text-slate-400" />
               </div>
               <span className="text-[10px] font-black text-slate-400 tracking-widest">Unit will default to active status</span>
            </div>
            
            <button 
              type="submit"
              disabled={mutation.isPending}
              className="px-10 py-5 bg-brand-green text-brand-sidebar font-black text-xs tracking-[0.3em] rounded-2xl shadow-xl shadow-brand-green/30 hover:bg-brand-sidebar hover:text-white transition-all active:scale-[0.96] flex items-center gap-4 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-brand-sidebar/30 border-t-brand-sidebar rounded-full animate-spin"></div>
                  Commissioning...
                </>
              ) : (
                <>
                  Commission Tactical Unit
                  <Lightning size={18} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddVehicleModal;
