import { useState } from 'react';
import {
  MessageSquareText as ChatText,
  Bell,
} from 'lucide-react';
import SmsGatewaySettings from '@/components/admin/SmsGatewaySettings';
import PushGatewaySettings from '@/components/admin/PushGatewaySettings';

const card = 'rounded-xl border shadow-sm';
const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };

/** Consolidated "how outbound alerts get sent" settings - SMS gateway config (used by
 *  Bulk SMS and case alerts) and Firebase push config (crew mobile alerts), each on its
 *  own tab. Split out of Bulk SMS / System Settings so both live in one predictable place. */
function NotificationsPage() {
  const [tab, setTab] = useState<'sms' | 'push'>('sms');

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div className={`p-4 sm:p-6 lg:p-8 ${card}`} style={cardStyle}>
        <p className="font-sans text-[11px] font-black tracking-[0.2em] mb-1" style={{ color: 'var(--muted)' }}>
          Messaging
        </p>
        <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight" style={{ color: 'var(--ink)' }}>
          Notifications
        </h2>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${tab === 'sms' ? 'on' : ''}`} onClick={() => setTab('sms')}>
          <ChatText size={15} /> SMS Gateway
        </button>
        <button type="button" className={`tab ${tab === 'push' ? 'on' : ''}`} onClick={() => setTab('push')}>
          <Bell size={15} /> Push Notifications
        </button>
      </div>

      {tab === 'sms' && <SmsGatewaySettings />}
      {tab === 'push' && <PushGatewaySettings />}
    </div>
  );
}

export default NotificationsPage;
