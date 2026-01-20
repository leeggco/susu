App({
  globalData: {
    supabaseUrl: 'https://xzclxkawykcwpavqnphs.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6Y2x4a2F3eWtjd3BhdnFucGhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4NzgwODgsImV4cCI6MjA4NDQ1NDA4OH0.gdrtkrjQxyYcJRMVUpaw_yXyW_0uEsgnXC1X5oRjpQA',
    supabaseFunctionsBaseUrl: '',
    supabaseScrapeKey: ''
  },
  onLaunch() {
    const g = this.globalData || {}
    if (!g.supabaseFunctionsBaseUrl && g.supabaseUrl) {
      this.globalData.supabaseFunctionsBaseUrl = `${g.supabaseUrl}/functions/v1`
    }
  }
})
