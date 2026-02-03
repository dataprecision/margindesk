"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  billable: boolean;
  ctc_monthly: number;
  utilization_target: number;
  start_date: string;
  end_date: string | null;
  manager: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: {
    allocations: number;
  };
}

interface Leave {
  id: string;
  zoho_leave_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
  created_at: string;
}

export default function EmployeeDetailsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id as string;

  const [person, setPerson] = useState<Person | null>(null);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && employeeId) {
      fetchEmployeeData();
    }
  }, [status, employeeId]);

  const fetchEmployeeData = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch person details
      const personRes = await fetch(`/api/people/${employeeId}`);
      if (!personRes.ok) {
        throw new Error("Failed to fetch employee details");
      }
      const personData = await personRes.json();
      setPerson(personData);

      // Fetch leaves
      const leavesRes = await fetch(`/api/people/${employeeId}/leaves`);
      if (!leavesRes.ok) {
        throw new Error("Failed to fetch leaves");
      }
      const leavesData = await leavesRes.json();
      setLeaves(leavesData.leaves || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching employee data:", err);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg text-red-600">{error}</div>
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg text-gray-600">Employee not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back button */}
        <div className="mb-6">
          <Link
            href="/employees"
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Employees
          </Link>
        </div>

        {/* Employee Details Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">{person.name}</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Email</h2>
              <p className="text-gray-900">{person.email}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Role</h2>
              <p className="text-gray-900">{person.role}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Department</h2>
              <p className="text-gray-900">{person.department || "-"}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Billable</h2>
              <p className="text-gray-900">{person.billable ? "Yes" : "No"}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">CTC Monthly</h2>
              <p className="text-gray-900">₹{person.ctc_monthly.toLocaleString()}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Utilization Target</h2>
              <p className="text-gray-900">{(person.utilization_target * 100).toFixed(0)}%</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Start Date</h2>
              <p className="text-gray-900">
                {new Date(person.start_date).toLocaleDateString()}
              </p>
            </div>

            {person.end_date && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-1">End Date</h2>
                <p className="text-gray-900">
                  {new Date(person.end_date).toLocaleDateString()}
                </p>
              </div>
            )}

            {person.manager && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-1">Manager</h2>
                <p className="text-gray-900">{person.manager.name}</p>
                <p className="text-sm text-gray-500">{person.manager.email}</p>
              </div>
            )}

            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-1">Active Allocations</h2>
              <p className="text-gray-900">{person._count.allocations}</p>
            </div>
          </div>
        </div>

        {/* Leave History */}
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Leave History ({leaves.length})
            </h2>
          </div>

          {leaves.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              No approved leaves found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Leave Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      From
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leaves.map((leave) => (
                    <tr key={leave.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {leave.leave_type}
                        </div>
                        <div className="text-xs text-gray-500">
                          {leave.leave_type_code}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(leave.start_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(leave.end_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {leave.days}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {leave.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {leave.reason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
