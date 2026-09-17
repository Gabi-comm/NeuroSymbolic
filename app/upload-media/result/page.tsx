import UploadResultUi from '@/components/UploadResultUi';

// Thin wrapper. UploadResultUi owns fetching for both entry points so there is
// exactly one path from a stored image to an analysis, instead of this page and
// the component each having their own.
export default function ScanMediaResult() {
  return <UploadResultUi backLinkHref="/upload-media" />;
}
