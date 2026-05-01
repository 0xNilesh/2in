import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { ROUTES } from '../lib/routes.js';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" sub="No route here · maybe try Today" />
      <div className="page">
        <Link to={ROUTES.today} className="btn">← Back to Today</Link>
      </div>
    </>
  );
}
