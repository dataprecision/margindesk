"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: "public" | "restricted" | "optional";
  description: string | null;
  zoho_holiday_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "public" | "restricted" | "optional">("all");
  const currentYear = new Date().getFullYear().toString();
  const [yearFilter, setYearFilter] = useState<string>(currentYear);

  const fetchHolidays = async () => {
    try {
      const response = await fetch("/api/holidays");
      const data = await response.json();
      setHolidays(data.holidays || []);
    } catch (error) {
      console.error("Failed to fetch holidays:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  // Extract unique years from holidays
  const years = Array.from(
    new Set(holidays.map((h) => new Date(h.date).getFullYear()))
  ).sort((a, b) => b - a);

  const filteredHolidays = holidays.filter((holiday) => {
    if (filter !== "all" && holiday.type !== filter) return false;
    if (yearFilter !== "all" && new Date(holiday.date).getFullYear().toString() !== yearFilter)
      return false;
    return true;
  });

  // Calculate counts based on filtered holidays (year filter applied)
  const yearFilteredHolidays = holidays.filter((holiday) => {
    if (yearFilter !== "all" && new Date(holiday.date).getFullYear().toString() !== yearFilter)
      return false;
    return true;
  });

  const publicCount = yearFilteredHolidays.filter((h) => h.type === "public").length;
  const restrictedCount = yearFilteredHolidays.filter((h) => h.type === "restricted").length;
  const optionalCount = yearFilteredHolidays.filter((h) => h.type === "optional").length;
  const totalCount = yearFilteredHolidays.length;

  const getTypeColor = (type: string) => {
    switch (type) {
      case "public":
        return "bg-blue-100 text-blue-700";
      case "restricted":
        return "bg-orange-100 text-orange-700";
      case "optional":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "public":
        return "Public Holiday";
      case "restricted":
        return "Restricted Holiday";
      case "optional":
        return "Optional Holiday";
      default:
        return type;
    }
  };

  // Group holidays by month for current year view
  const groupedByMonth = filteredHolidays.reduce((acc, holiday) => {
    const month = new Date(holiday.date).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(holiday);
    return acc;
  }, {} as Record<string, Holiday[]>);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with back link */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-gray-600 hover:text-gray-900 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Company Holidays</h1>
            <p className="text-gray-600 text-sm mt-1">
              View all company holidays synced from Zoho People
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-gray-600 text-sm">
            Total Holidays {yearFilter !== "all" && `(${yearFilter})`}
          </div>
          <div className="text-2xl font-bold">{totalCount}</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-lg shadow border border-blue-200">
          <div className="text-blue-700 text-sm">
            Public Holidays {yearFilter !== "all" && `(${yearFilter})`}
          </div>
          <div className="text-2xl font-bold text-blue-700">{publicCount}</div>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg shadow border border-orange-200">
          <div className="text-orange-700 text-sm">
            Restricted Holidays {yearFilter !== "all" && `(${yearFilter})`}
          </div>
          <div className="text-2xl font-bold text-orange-700">{restrictedCount}</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg shadow border border-purple-200">
          <div className="text-purple-700 text-sm">
            Optional Holidays {yearFilter !== "all" && `(${yearFilter})`}
          </div>
          <div className="text-2xl font-bold text-purple-700">{optionalCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All ({totalCount})
          </button>
          <button
            onClick={() => setFilter("public")}
            className={`px-4 py-2 rounded-lg ${
              filter === "public"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Public ({publicCount})
          </button>
          <button
            onClick={() => setFilter("restricted")}
            className={`px-4 py-2 rounded-lg ${
              filter === "restricted"
                ? "bg-orange-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Restricted ({restrictedCount})
          </button>
          <button
            onClick={() => setFilter("optional")}
            className={`px-4 py-2 rounded-lg ${
              filter === "optional"
                ? "bg-purple-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Optional ({optionalCount})
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg bg-white"
          >
            <option value="all">All Years</option>
            {years.map((year) => (
              <option key={year} value={year.toString()}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Holidays Display */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading...</div>
        ) : filteredHolidays.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No holidays found. Sync holidays from Zoho People in Settings.
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {Object.entries(groupedByMonth).map(([month, monthHolidays]) => (
              <div key={month}>
                <h2 className="text-lg font-semibold text-gray-800 mb-3 pb-2 border-b">
                  {month}
                </h2>
                <div className="space-y-2">
                  {monthHolidays
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((holiday) => {
                      const holidayDate = new Date(holiday.date);
                      const dayOfWeek = holidayDate.toLocaleDateString("en-US", {
                        weekday: "short",
                      });
                      const dayOfMonth = holidayDate.getDate();
                      const isPast = holidayDate < new Date();

                      return (
                        <div
                          key={holiday.id}
                          className={`flex items-start gap-4 p-4 rounded-lg border transition ${
                            isPast ? "bg-gray-50 opacity-70" : "bg-white hover:bg-gray-50"
                          }`}
                        >
                          {/* Date Box */}
                          <div className="flex-shrink-0 w-16 text-center">
                            <div className="text-sm text-gray-500 uppercase">{dayOfWeek}</div>
                            <div className="text-2xl font-bold text-gray-900">{dayOfMonth}</div>
                          </div>

                          {/* Holiday Details */}
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-gray-900">{holiday.name}</h3>
                                {holiday.description && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    {holiday.description}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-medium ${getTypeColor(
                                  holiday.type
                                )}`}
                              >
                                {getTypeBadge(holiday.type)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                              {holidayDate.toLocaleDateString("en-IN", {
                                weekday: "long",
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
