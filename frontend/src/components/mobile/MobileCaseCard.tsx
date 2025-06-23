import React, { useState } from 'react';
import { 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Eye,
  MessageSquare,
  Camera,
  Download,
  Share,
  MoreVertical,
  Flag,
  User,
  Calendar,
  MapPin,
  Phone
} from 'lucide-react';

interface CaseData {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'requires_action';
  type: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedDate: Date;
  dueDate?: Date;
  location?: string;
  contactInfo?: string;
  attachments?: number;
  comments?: number;
  flagged?: boolean;
  offline?: boolean;
}

interface MobileCaseCardProps {
  case: CaseData;
  onView: (caseId: string) => void;
  onApprove?: (caseId: string) => void;
  onReject?: (caseId: string) => void;
  onFlag?: (caseId: string) => void;
  onComment?: (caseId: string) => void;
  onShare?: (caseId: string) => void;
  emergencyMode?: boolean;
  compact?: boolean;
}

const MobileCaseCard: React.FC<MobileCaseCardProps> = ({
  case: caseData,
  onView,
  onApprove,
  onReject,
  onFlag,
  onComment,
  onShare,
  emergencyMode = false,
  compact = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-200 dark:border-red-700';
      case 'high':
        return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-200 dark:border-orange-700';
      case 'medium':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700';
      case 'low':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700';
      default:
        return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} className="text-green-600 dark:text-green-400" />;
      case 'rejected':
        return <XCircle size={16} className="text-red-600 dark:text-red-400" />;
      case 'under_review':
        return <Eye size={16} className="text-blue-600 dark:text-blue-400" />;
      case 'requires_action':
        return <AlertTriangle size={16} className="text-orange-600 dark:text-orange-400" />;
      default:
        return <Clock size={16} className="text-gray-600 dark:text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const isOverdue = (dueDate?: Date) => {
    if (!dueDate) return false;
    return new Date() > dueDate;
  };

  const handleQuickAction = (action: 'approve' | 'reject' | 'flag') => {
    switch (action) {
      case 'approve':
        onApprove?.(caseData.id);
        break;
      case 'reject':
        onReject?.(caseData.id);
        break;
      case 'flag':
        onFlag?.(caseData.id);
        break;
    }
    setShowActions(false);
  };

  return (
    <div 
      className={`mobile-patient-card relative ${
        caseData.priority === 'critical' ? 'ring-2 ring-red-300 dark:ring-red-700' : ''
      } ${caseData.flagged ? 'ring-2 ring-yellow-300 dark:ring-yellow-700' : ''} ${
        emergencyMode ? 'border-l-4 border-l-red-500' : ''
      }`}
    >
      {/* Offline Indicator */}
      {caseData.offline && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full" />
      )}

      {/* Case Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span className="mobile-patient-id">#{caseData.id}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(caseData.priority)}`}>
              {caseData.priority.toUpperCase()}
            </span>
          </div>
          
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mb-1">
            {caseData.title}
          </h3>
          
          <div className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
            {getStatusIcon(caseData.status)}
            <span>{getStatusText(caseData.status)}</span>
          </div>
        </div>

        <button
          onClick={() => setShowActions(!showActions)}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 relative"
        >
          <MoreVertical size={16} />
          
          {/* Actions Dropdown */}
          {showActions && (
            <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-32">
              <div className="py-1">
                <button
                  onClick={() => onView(caseData.id)}
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Eye size={14} className="mr-2" />
                  View
                </button>
                {onComment && (
                  <button
                    onClick={() => onComment(caseData.id)}
                    className="w-full flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <MessageSquare size={14} className="mr-2" />
                    Comment
                  </button>
                )}
                {onShare && (
                  <button
                    onClick={() => onShare(caseData.id)}
                    className="w-full flex items-center px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Share size={14} className="mr-2" />
                    Share
                  </button>
                )}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => handleQuickAction('flag')}
                  className="w-full flex items-center px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900"
                >
                  <Flag size={14} className="mr-2" />
                  Flag
                </button>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Patient Information */}
      <div className="mobile-patient-details">
        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
          <div className="flex items-center space-x-1">
            <User size={14} />
            <span>{caseData.patientName} ({caseData.patientAge}y)</span>
          </div>
          <div className="flex items-center space-x-1">
            <FileText size={14} />
            <span>{caseData.type}</span>
          </div>
        </div>

        {!compact && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
            {caseData.description}
          </p>
        )}

        {/* Case Metadata */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
          <div className="flex items-center space-x-1">
            <Calendar size={12} />
            <span>Submitted {formatDate(caseData.submittedDate)}</span>
          </div>
          {caseData.dueDate && (
            <div className={`flex items-center space-x-1 ${
              isOverdue(caseData.dueDate) ? 'text-red-600 dark:text-red-400' : ''
            }`}>
              <Clock size={12} />
              <span>Due {formatDate(caseData.dueDate)}</span>
            </div>
          )}
          {caseData.location && (
            <div className="flex items-center space-x-1">
              <MapPin size={12} />
              <span>{caseData.location}</span>
            </div>
          )}
          {caseData.contactInfo && (
            <div className="flex items-center space-x-1">
              <Phone size={12} />
              <span>{caseData.contactInfo}</span>
            </div>
          )}
        </div>

        {/* Attachments and Comments */}
        {(caseData.attachments || caseData.comments) && (
          <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
            {caseData.attachments && caseData.attachments > 0 && (
              <div className="flex items-center space-x-1">
                <Camera size={12} />
                <span>{caseData.attachments} files</span>
              </div>
            )}
            {caseData.comments && caseData.comments > 0 && (
              <div className="flex items-center space-x-1">
                <MessageSquare size={12} />
                <span>{caseData.comments} comments</span>
              </div>
            )}
          </div>
        )}

        {/* Submitted By */}
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Submitted by <span className="font-medium">{caseData.submittedBy}</span>
        </div>
      </div>

      {/* Quick Actions */}
      {!compact && (
        <div className="flex space-x-2">
          <button
            onClick={() => onView(caseData.id)}
            className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors"
          >
            <Eye size={14} className="mr-1" />
            View Details
          </button>

          {caseData.status === 'pending' && (
            <>
              {onApprove && (
                <button
                  onClick={() => handleQuickAction('approve')}
                  className="flex items-center justify-center px-3 py-2 bg-green-50 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-lg text-sm font-medium hover:bg-green-100 dark:hover:bg-green-800 transition-colors"
                >
                  <CheckCircle size={14} />
                </button>
              )}
              {onReject && (
                <button
                  onClick={() => handleQuickAction('reject')}
                  className="flex items-center justify-center px-3 py-2 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-100 dark:hover:bg-red-800 transition-colors"
                >
                  <XCircle size={14} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Emergency Mode Indicator */}
      {emergencyMode && caseData.priority === 'critical' && (
        <div className="absolute top-0 right-0 w-0 h-0 border-l-8 border-b-8 border-l-transparent border-b-red-500" />
      )}

      {/* Tap to Expand (Compact Mode) */}
      {compact && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="absolute inset-0 w-full h-full"
          aria-label="Expand case details"
        />
      )}

      {/* Expanded Details (Compact Mode) */}
      {compact && isExpanded && (
        <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 p-4 mt-1">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            {caseData.description}
          </p>
          
          <div className="flex space-x-2">
            <button
              onClick={() => onView(caseData.id)}
              className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium"
            >
              <Eye size={14} className="mr-1" />
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileCaseCard;