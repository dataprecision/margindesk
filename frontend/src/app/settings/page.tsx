"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

interface ZohoConnection {
  connected: boolean;
  organization_name?: string;
  organization_id?: string;
  connected_at?: string;
}

interface ZohoPeopleConnection {
  connected: boolean;
  organization_name?: string;
  connected_at?: string;
}

function SettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [zohoConnection, setZohoConnection] = useState<ZohoConnection>({
    connected: false,
  });
  const [zohoPeopleConnection, setZohoPeopleConnection] = useState<ZohoPeopleConnection>({
    connected: false,
  });
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [syncingLeaves, setSyncingLeaves] = useState(false);
  const [syncingHolidays, setSyncingHolidays] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  // Check for OAuth callback messages
  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");
    const msg = searchParams.get("message");

    if (success && msg) {
      setMessage({ type: "success", text: msg });
    } else if (error && msg) {
      setMessage({ type: "error", text: msg });
    }

    // Clear URL params after showing message
    if (success || error) {
      const timer = setTimeout(() => {
        router.replace("/settings");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (
      status === "authenticated" &&
      session?.user?.role !== "owner" &&
      session?.user?.role !== "finance"
    ) {
      router.push("/");
    }
  }, [status, session, router]);

  // Fetch Zoho connection statuses
  useEffect(() => {
    if (status === "authenticated") {
      Promise.all([fetchZohoStatus(), fetchZohoPeopleStatus()]);
    }
  }, [status]);

  const fetchZohoStatus = async () => {
    try {
      const response = await fetch("/api/settings/zoho");
      if (response.ok) {
        const data = await response.json();
        setZohoConnection(data);
      }
    } catch (err) {
      console.error("Error fetching Zoho status:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchZohoPeopleStatus = async () => {
    try {
      const response = await fetch("/api/settings/zoho-people");
      if (response.ok) {
        const data = await response.json();
        setZohoPeopleConnection(data);
      }
    } catch (err) {
      console.error("Error fetching Zoho People status:", err);
    }
  };

  const handleConnectZoho = () => {
    // Build authorization URL
    const region = process.env.NEXT_PUBLIC_ZOHO_REGION || "US";
    const accountsUrl =
      region === "IN" ? "https://accounts.zoho.in" : "https://accounts.zoho.com";

    const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
    authUrl.searchParams.set(
      "scope",
      "ZohoBooks.settings.READ,ZohoBooks.contacts.READ,ZohoBooks.customerpayments.READ,ZohoBooks.expenses.READ,ZohoBooks.bills.READ,ZohoBooks.vendorpayments.READ,ZohoBooks.accountants.READ"
    );
    authUrl.searchParams.set(
      "client_id",
      process.env.NEXT_PUBLIC_ZOHO_CLIENT_ID || ""
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set(
      "redirect_uri",
      `${window.location.origin}/api/zoho/callback`
    );

    // Redirect to Zoho authorization
    window.location.href = authUrl.toString();
  };

  const handleDisconnectZoho = async () => {
    if (!confirm("Are you sure you want to disconnect Zoho Books?")) {
      return;
    }

    try {
      const response = await fetch("/api/settings/zoho", {
        method: "DELETE",
      });

      if (response.ok) {
        setZohoConnection({ connected: false });
        setMessage({
          type: "success",
          text: "Zoho Books disconnected successfully",
        });
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: error.error || "Failed to disconnect Zoho Books",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Error disconnecting Zoho Books",
      });
    }
  };

  const handleConnectZohoPeople = () => {
    // Build authorization URL for Zoho People
    const region = process.env.NEXT_PUBLIC_ZOHO_REGION || "US";
    const accountsUrl =
      region === "IN" ? "https://accounts.zoho.in" : "https://accounts.zoho.com";

    const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
    authUrl.searchParams.set(
      "scope",
      "ZohoPeople.forms.READ,ZohoPeople.employee.READ,ZohoPeople.leave.READ,ZohoPeople.attendance.READ"
    );
    authUrl.searchParams.set(
      "client_id",
      process.env.NEXT_PUBLIC_ZOHO_CLIENT_ID || ""
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set(
      "redirect_uri",
      `${window.location.origin}/api/zoho-people/callback`
    );

    // Redirect to Zoho authorization
    window.location.href = authUrl.toString();
  };

  const handleDisconnectZohoPeople = async () => {
    if (!confirm("Are you sure you want to disconnect Zoho People?")) {
      return;
    }

    try {
      const response = await fetch("/api/settings/zoho-people", {
        method: "DELETE",
      });

      if (response.ok) {
        setZohoPeopleConnection({ connected: false });
        setMessage({
          type: "success",
          text: "Zoho People disconnected successfully",
        });
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: error.error || "Failed to disconnect Zoho People",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Error disconnecting Zoho People",
      });
    }
  };

  const handleSyncEmployees = async () => {
    setSyncingEmployees(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "employees" }),
      });

      if (response.ok) {
        const result = await response.json();
        setSyncResult(result.syncLog);
        setMessage({
          type: "success",
          text: `Employees synced: ${result.syncLog.synced} records`,
        });
      } else {
        const errorData = await response.json();
        setMessage({
          type: "error",
          text: errorData.error || "Failed to sync employees",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Error syncing employees from Zoho People",
      });
    } finally {
      setSyncingEmployees(false);
    }
  };

  const handleSyncLeaves = async () => {
    setSyncingLeaves(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "leaves" }),
      });

      if (response.ok) {
        const result = await response.json();
        setSyncResult(result.syncLog);
        setMessage({
          type: "success",
          text: `Leaves synced: ${result.syncLog.synced} records`,
        });
      } else {
        const errorData = await response.json();
        setMessage({
          type: "error",
          text: errorData.error || "Failed to sync leaves",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Error syncing leaves from Zoho People",
      });
    } finally {
      setSyncingLeaves(false);
    }
  };

  const handleSyncHolidays = async () => {
    setSyncingHolidays(true);
    setSyncResult(null);

    try {
      const response = await fetch("/api/sync/zoho-people", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ syncType: "holidays" }),
      });

      if (response.ok) {
        const result = await response.json();
        setSyncResult(result.syncLog);
        setMessage({
          type: "success",
          text: `Holidays synced: ${result.syncLog.synced} records`,
        });
      } else {
        const errorData = await response.json();
        setMessage({
          type: "error",
          text: errorData.error || "Failed to sync holidays",
        });
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: "Error syncing holidays from Zoho People",
      });
    } finally {
      setSyncingHolidays(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">
            Manage integrations and system configuration
          </p>
        </div>

        {/* Message Display */}
        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded border ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <div className="flex items-start">
              {message.type === "success" ? (
                <svg
                  className="h-5 w-5 text-green-600 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-red-600 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <div className="flex-1">
                <p>{message.text}</p>
              </div>
              <button
                onClick={() => setMessage(null)}
                className={`${
                  message.type === "success"
                    ? "text-green-700 hover:text-green-900"
                    : "text-red-700 hover:text-red-900"
                }`}
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Integrations Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Integrations</h2>
            <p className="text-sm text-gray-600 mt-1">
              Connect external services to sync data
            </p>
          </div>

          <div className="p-6">
            {/* Zoho Books Integration */}
            <div className="flex items-start justify-between p-4 border border-gray-200 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    Z
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Zoho Books</h3>
                    <p className="text-sm text-gray-600">
                      Sync clients and cash receipts from Zoho Books
                    </p>
                  </div>
                </div>

                {zohoConnection.connected && (
                  <div className="mt-3 ml-15 text-sm">
                    <div className="flex items-center gap-2 text-green-600 mb-1">
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-medium">Connected</span>
                    </div>
                    <p className="text-gray-600">
                      Organization:{" "}
                      <span className="font-medium">
                        {zohoConnection.organization_name}
                      </span>
                    </p>
                    {zohoConnection.connected_at && (
                      <p className="text-gray-500 text-xs">
                        Connected on{" "}
                        {new Date(zohoConnection.connected_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="ml-4">
                {zohoConnection.connected ? (
                  <button
                    onClick={handleDisconnectZoho}
                    className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConnectZoho}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Zoho People Integration */}
            <div className="flex items-start justify-between p-4 border border-gray-200 rounded-lg mt-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    ZP
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Zoho People</h3>
                    <p className="text-sm text-gray-600">
                      Sync employees and HR data from Zoho People
                    </p>
                  </div>
                </div>

                {zohoPeopleConnection.connected && (
                  <div className="mt-3 ml-15 text-sm">
                    <div className="flex items-center gap-2 text-green-600 mb-1">
                      <svg
                        className="h-4 w-4"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-medium">Connected</span>
                    </div>
                    <p className="text-gray-600">
                      Organization:{" "}
                      <span className="font-medium">
                        {zohoPeopleConnection.organization_name}
                      </span>
                    </p>
                    {zohoPeopleConnection.connected_at && (
                      <p className="text-gray-500 text-xs">
                        Connected on{" "}
                        {new Date(zohoPeopleConnection.connected_at).toLocaleDateString()}
                      </p>
                    )}

                    {/* Sync Buttons */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={handleSyncEmployees}
                        disabled={syncingEmployees}
                        className="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {syncingEmployees ? "Syncing..." : "Sync Employees"}
                      </button>
                      <button
                        onClick={handleSyncLeaves}
                        disabled={syncingLeaves}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {syncingLeaves ? "Syncing..." : "Sync Leaves"}
                      </button>
                      <button
                        onClick={handleSyncHolidays}
                        disabled={syncingHolidays}
                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {syncingHolidays ? "Syncing..." : "Sync Holidays"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="ml-4">
                {zohoPeopleConnection.connected ? (
                  <button
                    onClick={handleDisconnectZohoPeople}
                    className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConnectZohoPeople}
                    className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>

            {/* Placeholder for Microsoft Graph */}
            <div className="flex items-start justify-between p-4 border border-gray-200 rounded-lg mt-4 opacity-50">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                    M
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      Microsoft Graph
                    </h3>
                    <p className="text-sm text-gray-600">
                      Sync users and organizational data
                    </p>
                  </div>
                </div>
              </div>
              <div className="ml-4">
                <button
                  disabled
                  className="px-4 py-2 text-sm bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
                >
                  Coming Soon
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-gray-500">Loading...</div></div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
