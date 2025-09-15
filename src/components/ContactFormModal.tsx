import React, { useState } from 'react'
import { X, Send, User, Mail, MessageSquare } from 'lucide-react'
import { ContactService } from '../services/contactService'
import toast from 'react-hot-toast'

interface ContactFormModalProps {
  isOpen: boolean
  onClose: () => void
  recipient: string
  recipientEmail: string
  prefillSubject?: string
}

interface FormData {
  name: string
  email: string
  subject: string
  message: string
}

export default function ContactFormModal({
  isOpen,
  onClose,
  recipient,
  recipientEmail,
  prefillSubject = `Message to ${recipient}`
}: ContactFormModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    subject: prefillSubject,
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')

    try {
      // Use existing ContactService to save message
      const messageData = {
        name: formData.name,
        email: formData.email,
        phone: '', // Not collected in founder form
        inquiryType: 'founder_message',
        message: `Subject: ${formData.subject}\n\nMessage: ${formData.message}`,
        // Additional founder-specific fields
        recipient: recipient,
        recipientEmail: recipientEmail,
        originalSubject: formData.subject
      }
      
      await ContactService.submitMessage(messageData)
      
      setSubmitStatus('success')
      toast.success(`Message sent to ${recipient}! We'll get back to you soon.`)
      
      // Reset form after successful submission
      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          subject: prefillSubject,
          message: ''
        })
        setSubmitStatus('idle')
        onClose()
      }, 2000)
      
    } catch (error) {
      console.error('Error submitting contact form:', error)
      setSubmitStatus('error')
      toast.error('Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        name: '',
        email: '',
        subject: prefillSubject,
        message: ''
      })
      setSubmitStatus('idle')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 p-2 rounded-lg">
              <MessageSquare className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Message {recipient}</h3>
              <p className="text-sm text-gray-500">Send a direct message</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                disabled={isSubmitting}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your name"
              />
            </div>
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Your Email *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={isSubmitting}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your email"
              />
            </div>
          </div>

          {/* Subject Field */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject *
            </label>
            <input
              type="text"
              id="subject"
              name="subject"
              value={formData.subject}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Enter subject"
            />
          </div>

          {/* Message Field */}
          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message *
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              placeholder="Write your message here..."
            />
          </div>

          {/* Status Messages */}
          {submitStatus === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-800 text-sm">
                ✅ Message sent successfully! {recipient} will receive your message.
              </p>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm">
                ❌ Failed to send message. Please try again.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formData.name || !formData.email || !formData.message}
              className="flex-1 px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Message
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
