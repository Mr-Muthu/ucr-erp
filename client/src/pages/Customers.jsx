import CrudPage from '../components/CrudPage';
import { customersApi } from '../api/resources';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'licenseNumber', label: 'License No.' },
];

const fields = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address' },
  { name: 'idProofType', label: 'ID Proof Type (Aadhaar, Passport…)' },
  { name: 'idProofNumber', label: 'ID Proof Number' },
  { name: 'licenseNumber', label: 'Driving License Number' },
  { name: 'licenseExpiry', label: 'License Expiry', type: 'date', transformIn: (v) => v?.slice(0, 10) },
];

export default function Customers() {
  return (
    <CrudPage
      title="Customers"
      description="Customer directory and ID/license records."
      queryKey="customers"
      resource={customersApi}
      columns={columns}
      fields={fields}
    />
  );
}
