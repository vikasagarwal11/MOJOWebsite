import React, { useState } from 'react';
import { 
  Shield, 
  AlertTriangle, 
  Users, 
  FileText, 
  Clock, 
  Ban, 
  CheckCircle, 
  XCircle, 
  Eye,
  MessageSquare,
  Calendar,
  FileText as FileTextIcon,
  UserX,
  TrendingUp,
  Filter,
  Search
} from 'lucide-react';
import { useUserBlocking } from '../../hooks/useUserBlocking';
import { BlockReason, BlockCategory, AppealStatus } from '../../types/blocking';
import { format } from 'date-fns';

export const UserBlockingDashboard: React.FC = () => {
  const {
    userBlocks,
    blockedUsers,
    blockReports,
    blockSummary,
    loading,
    loadingReports,
    unblockUser,
    updateBlock,
    reviewReport,
    isAdmin
  } = useUserBlocking();

  const [activeTab, setActiveTab] = useState<'overview' | 'blocks' | 'reports' | 'appeals'>('overview');
  const [selectedBlock, setSelectedBlock] = useState<any>(null);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [filterReason, setFilterReason] = useState<BlockReason | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<BlockCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isAdmin) {
    return (
      <div className="p-6 text-center">
        <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Admin Access Required</h3>
        <p className="text-gray-600">Only administrators can access the user blocking dashboard.</p>
      </div>
    );
  }

  const filteredBlocks = userBlocks.filter(block => {
    if (filterReason !== 'all' && block.reason !== filterReason) return false;
    if (filterCategory !== 'all' && block.category !== filterCategory) return false;
    if (searchQuery && !block.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredReports = blockReports.filter(report => {
    if (filterReason !== 'all' && report.reason !== filterReason) return false;
    if (searchQuery && !report.description?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const pendingAppeals = userBlocks.filter(block => 
    block.appealStatus === 'pending' || block.appealStatus === 'under_review'
  );

  const getReasonIcon = (reason: BlockReason) => {
    switch (reason) {
      case 'harassment': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'spam': return <MessageSquare className="w-4 h-4 text-orange-500" />;
      case 'inappropriate_content': return <FileTextIcon className="w-4 h-4 text-yellow-500" />;
      case 'fake_account': return <UserX className="w-4 h-4 text-purple-500" />;
      case 'security_violation': return <Shield className="w-4 h-4 text-blue-500" />;
      case 'terms_violation': return <Ban className="w-4 h-4 text-red-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getCategoryIcon = (category: BlockCategory) => {
    switch (category) {
      case 'platform_wide': return <Ban className="w-4 h-4 text-red-600" />;
      case 'content_only': return <FileTextIcon className="w-4 h-4 text-orange-500" />;
      case 'interaction_only': return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'rsvp_only': return <Calendar className="w-4 h-4 text-green-500" />;
      case 'temporary': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'permanent': return <Ban className="w-4 h-4 text-red-700" />;
      default: return <Shield className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: AppealStatus) => {
    switch (status) {
      case 'pending': return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'under_review': return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Under Review</span>;
      case 'approved': return <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Approved</span>;
      case 'rejected': return <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Rejected</span>;
      default: return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">Unknown</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Blocking Dashboard</h2>
          <p className="text-gray-600">Manage user blocks, reports, and appeals</p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-red-600" />
          <span className="text-sm text-gray-500">Admin Panel</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: 'Overview', icon: <TrendingUp className="w-4 h-4" /> },
            { id: 'blocks', label: 'Active Blocks', icon: <Ban className="w-4 h-4" /> },
            { id: 'reports', label: 'Reports', icon: <FileText className="w-4 h-4" /> },
            { id: 'appeals', label: 'Appeals', icon: <MessageSquare className="w-4 h-4" /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && blockSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <Ban className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Blocks</p>
                <p className="text-2xl font-bold text-gray-900">{blockSummary.totalBlocks}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Active Blocks</p>
                <p className="text-2xl font-bold text-gray-900">{blockSummary.activeBlocks}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Pending Appeals</p>
                <p className="text-2xl font-bold text-gray-900">{blockSummary.pendingAppeals}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Reports Today</p>
                <p className="text-2xl font-bold text-gray-900">
                  {blockReports.filter(r => 
                    r.createdAt?.toDate?.() && 
                    r.createdAt.toDate().toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Blocks Tab */}
      {activeTab === 'blocks' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>
              
              <select
                value={filterReason}
                onChange={(e) => setFilterReason(e.target.value as BlockReason | 'all')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Reasons</option>
                <option value="harassment">Harassment</option>
                <option value="spam">Spam</option>
                <option value="inappropriate_content">Inappropriate Content</option>
                <option value="fake_account">Fake Account</option>
                <option value="security_violation">Security Violation</option>
                <option value="terms_violation">Terms Violation</option>
                <option value="other">Other</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as BlockCategory | 'all')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Categories</option>
                <option value="platform_wide">Platform Wide</option>
                <option value="content_only">Content Only</option>
                <option value="interaction_only">Interaction Only</option>
                <option value="rsvp_only">RSVP Only</option>
                <option value="temporary">Temporary</option>
                <option value="permanent">Permanent</option>
              </select>

              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search blocks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm w-48"
                />
              </div>
            </div>
          </div>

          {/* Blocks List */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Active Blocks ({filteredBlocks.length})</h3>
            </div>
            
            {loading ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading blocks...</p>
              </div>
            ) : filteredBlocks.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Ban className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p>No blocks found matching the current filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredBlocks.map((block) => (
                  <div key={block.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getReasonIcon(block.reason)}
                          <span className="font-medium text-gray-900">
                            Blocked User: {block.blockedUserId.slice(0, 8)}...
                          </span>
                          {getCategoryIcon(block.category)}
                          <span className="text-sm text-gray-500">
                            {block.category.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        
                        <p className="text-gray-700 mb-2">{block.description}</p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Created: {format(block.createdAt?.toDate() || new Date(), 'MMM d, yyyy')}</span>
                          {block.expiresAt && (
                            <span>Expires: {format(block.expiresAt.toDate(), 'MMM d, yyyy')}</span>
                          )}
                          {block.appealStatus && (
                            <span>Appeal: {getStatusBadge(block.appealStatus)}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedBlock(block)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => unblockUser(block.id)}
                          className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors"
                          title="Unblock user"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Block Reports ({filteredReports.length})</h3>
            </div>
            
            {loadingReports ? (
              <div className="p-6 text-center">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-gray-500 mt-2">Loading reports...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p>No reports found matching the current filters.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredReports.map((report) => (
                  <div key={report.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {getReasonIcon(report.reason)}
                          <span className="font-medium text-gray-900">
                            Reported User: {report.reportedUserId.slice(0, 8)}...
                          </span>
                          <span className="text-sm text-gray-500">
                            by {report.reporterUserId.slice(0, 8)}...
                          </span>
                        </div>
                        
                        <p className="text-gray-700 mb-2">{report.description}</p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Reported: {format(report.createdAt?.toDate() || new Date(), 'MMM d, yyyy')}</span>
                          <span>Status: {report.status}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedReport(report)}
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {report.status === 'pending' && (
                          <>
                            <button
                              onClick={() => reviewReport(report.id, 'resolved')}
                              className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-full transition-colors"
                              title="Mark as resolved"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => reviewReport(report.id, 'dismissed')}
                              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
                              title="Dismiss report"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Appeals Tab */}
      {activeTab === 'appeals' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-medium text-gray-900">Pending Appeals ({pendingAppeals.length})</h3>
            </div>
            
            {pendingAppeals.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p>No pending appeals at this time.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {pendingAppeals.map((block) => (
                  <div key={block.id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <MessageSquare className="w-4 h-4 text-blue-500" />
                          <span className="font-medium text-gray-900">
                            Appeal from: {block.blockedUserId.slice(0, 8)}...
                          </span>
                          {getStatusBadge(block.appealStatus || 'pending')}
                        </div>
                        
                        <p className="text-gray-700 mb-2">
                          <strong>Original Reason:</strong> {block.description}
                        </p>
                        
                        {block.appealReason && (
                          <p className="text-gray-700 mb-2">
                            <strong>Appeal Reason:</strong> {block.appealReason}
                          </p>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Blocked: {format(block.createdAt?.toDate() || new Date(), 'MMM d, yyyy')}</span>
                          {block.appealSubmittedAt && (
                            <span>Appeal Submitted: {format(block.appealSubmittedAt.toDate(), 'MMM d, yyyy')}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateBlock(block.id, { appealStatus: 'approved' })}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => updateBlock(block.id, { appealStatus: 'rejected' })}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
