import UploadResultUi from '@/components/UploadResultUi';

// Scan results are informational. Figure 7.5 of the paper requires an address
// before a report can proceed, so this screen offers a route into the report
// flow rather than a submit button.
export default function ScanMediaResult() {
  return <UploadResultUi backLinkHref="/upload-media" mode="scan" />;
}
