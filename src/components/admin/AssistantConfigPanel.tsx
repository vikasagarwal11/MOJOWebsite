import React, { useEffect, useState } from 'react';
import { Save, Loader2, Settings, Info } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  getAssistantConfig, 
  updateAssistantConfig, 
  DEFAULT_KB_CONTEXT_PROMPT,
  DEFAULT_GENERAL_KNOWLEDGE_PROMPT,
  DEFAULT_NO_CONTEXT_PROMPT
} from '../../services/assistantConfigService';
import { useAuth } from '../../contexts/AuthContext';

export const AssistantConfigPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [kbContextPrompt, setKbContextPrompt] = useState(DEFAULT_KB_CONTEXT_PROMPT);
  const [generalKnowledgePrompt, setGeneralKnowledgePrompt] = useState(DEFAULT_GENERAL_KNOWLEDGE_PROMPT);
  const [noContextPrompt, setNoContextPrompt] = useState(DEFAULT_NO_CONTEXT_PROMPT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'kb' | 'general' | 'no-context'>('kb');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await getAssistantConfig();
      setKbContextPrompt(config.kbContextPrompt || DEFAULT_KB_CONTEXT_PROMPT);
      setGeneralKnowledgePrompt(config.generalKnowledgePrompt || DEFAULT_GENERAL_KNOWLEDGE_PROMPT);
      setNoContextPrompt(config.noContextPrompt || DEFAULT_NO_CONTEXT_PROMPT);
    } catch (error: any) {
      console.error('[AssistantConfigPanel] Error loading config:', error);
      toast.error('Failed to load assistant configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.id) {
      toast.error('You must be logged in to save configuration');
      return;
    }

    try {
      setSaving(true);
      await updateAssistantConfig(
        {
          kbContextPrompt: kbContextPrompt.trim(),
          generalKnowledgePrompt: generalKnowledgePrompt.trim(),
          noContextPrompt: noContextPrompt.trim(),
        },
        currentUser.id
      );
      toast.success('Assistant configuration saved successfully');
    } catch (error: any) {
      console.error('[AssistantConfigPanel] Error saving config:', error);
      toast.error('Failed to save assistant configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset to default configuration?')) {
      setKbContextPrompt(DEFAULT_KB_CONTEXT_PROMPT);
      setGeneralKnowledgePrompt(DEFAULT_GENERAL_KNOWLEDGE_PROMPT);
      setNoContextPrompt(DEFAULT_NO_CONTEXT_PROMPT);
      toast.success('Reset to default configuration');
    }
  };

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F25129]" />
        </div>
      </div>
    );
  }

  const getCurrentPrompt = () => {
    switch (activeTab) {
      case 'kb':
        return kbContextPrompt;
      case 'general':
        return generalKnowledgePrompt;
      case 'no-context':
        return noContextPrompt;
    }
  };

  const setCurrentPrompt = (value: string) => {
    switch (activeTab) {
      case 'kb':
        setKbContextPrompt(value);
        break;
      case 'general':
        setGeneralKnowledgePrompt(value);
        break;
      case 'no-context':
        setNoContextPrompt(value);
        break;
    }
  };

  const getCurrentDefault = () => {
    switch (activeTab) {
      case 'kb':
        return DEFAULT_KB_CONTEXT_PROMPT;
      case 'general':
        return DEFAULT_GENERAL_KNOWLEDGE_PROMPT;
      case 'no-context':
        return DEFAULT_NO_CONTEXT_PROMPT;
    }
  };

  const getTabDescription = () => {
    switch (activeTab) {
      case 'kb':
        return 'This prompt is used when the assistant has relevant knowledge base content to answer the question. It should instruct the model to use the provided context and include citations.';
      case 'general':
        return 'This prompt is used when answering questions that are not found in the knowledge base. It should focus on lifestyle, fitness, and general health topics relevant to moms.';
      case 'no-context':
        return 'This prompt is used when no knowledge base context is available and general knowledge is disabled. It should instruct the model to politely decline or redirect.';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-[#F25129]" />
            <h2 className="text-xl font-semibold text-gray-900">Assistant Configuration</h2>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-1">
            <button
              onClick={() => setActiveTab('kb')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'kb'
                  ? 'text-[#F25129] border-b-2 border-[#F25129]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              KB Context Prompt
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'general'
                  ? 'text-[#F25129] border-b-2 border-[#F25129]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              General Knowledge Prompt
            </button>
            <button
              onClick={() => setActiveTab('no-context')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'no-context'
                  ? 'text-[#F25129] border-b-2 border-[#F25129]'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              No Context Prompt
            </button>
          </nav>
        </div>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">
                {activeTab === 'kb' && 'KB Context Prompt'}
                {activeTab === 'general' && 'General Knowledge Prompt'}
                {activeTab === 'no-context' && 'No Context Prompt'}
              </p>
              <p>{getTabDescription()}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
              System Prompt
            </label>
            <textarea
              id="prompt"
              value={getCurrentPrompt()}
              onChange={(e) => setCurrentPrompt(e.target.value)}
              rows={20}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent font-mono text-sm"
              placeholder="Enter the system prompt..."
            />
            <p className="mt-2 text-sm text-gray-500">
              {getCurrentPrompt().length} characters
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-[#F25129] text-white rounded-lg hover:bg-[#E0441F] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save All Prompts
                </>
              )}
            </button>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to reset the ${activeTab === 'kb' ? 'KB Context' : activeTab === 'general' ? 'General Knowledge' : 'No Context'} prompt to default?`)) {
                  setCurrentPrompt(getCurrentDefault());
                  toast.success('Reset to default');
                }
              }}
              className="px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              Reset Current Tab
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              Reset All to Defaults
            </button>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Tips:</h3>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            {activeTab === 'kb' && (
              <>
                <li>Instruct the model to use the provided context and cite sources</li>
                <li>Include format for citations: [#1], [#2], etc.</li>
                <li>Tell the model NOT to include a separate "Sources" section</li>
                <li>Maintain a friendly, encouraging tone</li>
              </>
            )}
            {activeTab === 'general' && (
              <>
                <li>Keep the prompt focused on fitness, wellness, and lifestyle topics</li>
                <li>Specify what topics are out of scope (medical advice, legal, financial)</li>
                <li>Include instructions to redirect off-topic questions</li>
                <li>Ensure citation marker [#1] is included for general knowledge answers</li>
              </>
            )}
            {activeTab === 'no-context' && (
              <>
                <li>Instruct the model to politely decline when information is not available</li>
                <li>Do not include citation instructions (no sources available)</li>
                <li>Maintain a helpful, friendly tone even when declining</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

