'use client';
// TEMP: renders the reporter dashboard with sample data for tour screenshots. Delete after use.
import UserDashboard from '@/components/dashboard/UserDashboard';
import { __primeUserSummary } from '@/utils/userData';

const types = ['Pothole', 'Alligator Crack', 'Longitudinal Crack', 'Transverse Crack'];
const sevs = ['High', 'Medium', 'Low', 'High', 'Medium', 'Medium', 'High', 'Low', 'Medium', 'High', 'Low', 'Medium'];
const brgys = ['Barangay 77', 'Barangay 74', 'Barangay 120', 'Barangay 35', 'Barangay 8', 'Barangay 59'];
const day = 86400000;
const now = Date.now();
const reports = sevs.map((s, i) => ({
  id: 900 + i,
  uploadtime: new Date(now - i * 2.3 * day).toISOString(),
  damage_type: types[i % 4],
  severity: s,
  corrected_damage_type: null,
  corrected_severity: null,
  corrected_at: i === 2 ? new Date(now - 1.5 * day).toISOString() : null,
  state: i % 3 === 2 ? 'Resolved' : 'Needs Action',
  address: ['Samson Road', 'Caimito Road', 'A. Mabini Street', 'Rizal Avenue Ext.', 'Malonzo Street', 'Gen. San Miguel St.'][i % 6] + ', Caloocan',
  barangay: brgys[i % 6],
  lat: 14.648 + ((i * 37) % 23) / 1000,
  lng: 120.968 + ((i * 53) % 25) / 1000,
}));
const captures = [0, 1, 2].map((i) => ({
  id: 'c' + i,
  user_id: 'demo',
  image_path: 'demo/' + i,
  file_name: null,
  lat: 14.655 + i / 300,
  lng: 120.975 + i / 250,
  location_accuracy_m: 6,
  location_source: 'gps',
  address: ['Samson Road, Caloocan', 'Caimito Road, Caloocan', 'EDSA, Caloocan'][i],
  barangay: ['Barangay 77', 'Barangay 80', 'Barangay 76'][i],
  road_name: null,
  road_class: null,
  surface: null,
  captured_at: new Date(now - (i + 0.3) * day).toISOString(),
  reported_at: null,
}));
__primeUserSummary('demo', {
  reports,
  images: { '900': '/zz-shots/a.jpg', '901': '/zz-shots/b.jpg', '902': '/zz-shots/c.jpg' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captures: captures as any,
  capturesWaiting: 3,
  thumbs: { 'demo/0': '/zz-shots/c.jpg', 'demo/1': '/zz-shots/a.jpg', 'demo/2': '/zz-shots/b.jpg' },
});

export default function Page() {
  return <UserDashboard userId="demo" name="Gabriel" />;
}
