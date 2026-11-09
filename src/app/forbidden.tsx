import Link from 'next/link';

export default function Forbidden() {
  return (
    <main id="main" className="status-page">
      <div>
        <div className="code">403</div>
        <h1>You don&apos;t have access to this page</h1>
        <p>Your role can&apos;t open this area. Go back to your own dashboard.</p>
        <Link className="btn btn-primary" href="/">Back to GAJIAN</Link>
      </div>
    </main>
  );
}
