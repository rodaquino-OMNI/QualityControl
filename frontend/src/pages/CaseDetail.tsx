import React from 'react';
import { useParams, Link } from 'react-router-dom';

const CaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  // Mock data - replace with API call
  const caseData = {
    id,
    title: 'Post-operative infection monitoring',
    patientId: 'P-2024-001',
    patientName: 'John Doe',
    priority: 'high',
    status: 'open',
    assignedTo: 'Dr. Smith',
    createdAt: '2024-01-15 10:30 AM',
    updatedAt: '2024-01-15 02:45 PM',
    description: 'Patient showing signs of possible post-operative infection. Requires immediate attention and monitoring.',
    notes: [
      {
        id: '1',
        author: 'Dr. Smith',
        content: 'Initial assessment completed. Prescribed antibiotics.',
        timestamp: '2024-01-15 11:00 AM',
      },
      {
        id: '2',
        author: 'Nurse Johnson',
        content: 'Vital signs recorded. Temperature slightly elevated.',
        timestamp: '2024-01-15 01:30 PM',
      },
    ],
  };

  return (
    <div>
      <div className="mb-6">
        <Link to="/cases" className="text-primary-600 hover:text-primary-700 text-sm mb-2 inline-block">
          ← Back to Cases
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {caseData.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Case ID: {caseData.id} • Patient: {caseData.patientName} ({caseData.patientId})
            </p>
          </div>
          <button className="btn-primary">
            Edit Case
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Case Details */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Case Details
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
                <p className="mt-1 text-gray-900 dark:text-white">{caseData.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created</h3>
                  <p className="mt-1 text-gray-900 dark:text-white">{caseData.createdAt}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</h3>
                  <p className="mt-1 text-gray-900 dark:text-white">{caseData.updatedAt}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Notes & Updates
            </h2>
            <div className="space-y-4">
              {caseData.notes.map((note) => (
                <div key={note.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {note.author}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {note.timestamp}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-gray-700 dark:text-gray-300">{note.content}</p>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <textarea
                className="input"
                rows={3}
                placeholder="Add a note..."
              />
              <button className="btn-primary mt-2">
                Add Note
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Case Information
            </h2>
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                <span className={`inline-flex mt-1 status-badge bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200`}>
                  {caseData.status}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Priority</h3>
                <span className={`inline-flex mt-1 status-badge priority-${caseData.priority}`}>
                  {caseData.priority.toUpperCase()}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Assigned To</h3>
                <p className="mt-1 text-gray-900 dark:text-white">{caseData.assignedTo}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Actions
            </h2>
            <div className="space-y-2">
              <button className="w-full btn-outline">
                Change Status
              </button>
              <button className="w-full btn-outline">
                Reassign Case
              </button>
              <button className="w-full btn-outline text-danger-600 border-danger-300 hover:bg-danger-50">
                Close Case
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaseDetail;