import UploadResultUi from '@/components/UploadResultUi';

// backLinkHref pointed at /report-damage/upload, a route that does not exist,
// so the back arrow on this screen always 404'd.
export default function ReportDamageResult() {
  return <UploadResultUi backLinkHref="/report-damage" />;
}
