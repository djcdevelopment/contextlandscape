[CmdletBinding()]
param(
  [ValidateNotNullOrEmpty()]
  [string] $BaseUrl = 'http://127.0.0.1:9080',

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $ExpectedReleaseId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^sha256:[0-9a-f]{64}$')]
  [string] $ExpectedCatalogHash,

  [Parameter(Mandatory = $true)]
  [ValidateRange(1, [int]::MaxValue)]
  [int] $ExpectedCatalogItems,

  [ValidatePattern('^/(?!/).*$')]
  [string] $AppEntryPath = '/landscape/?view=hangar'
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
Add-Type -AssemblyName System.Net.Http

function Assert-True([bool] $Condition, [string] $Label) {
  if (-not $Condition) { throw $Label }
  Write-Host "PASS  $Label" -ForegroundColor Green
}

function Assert-Equal([object] $Actual, [object] $Expected, [string] $Label) {
  if ($Actual -ne $Expected) { throw "$Label expected '$Expected' but got '$Actual'" }
  Write-Host "PASS  $Label = $Actual" -ForegroundColor Green
}

function ConvertFrom-SmokeJson([byte[]] $Bytes, [string] $Label) {
  try {
    return ([Text.Encoding]::UTF8.GetString($Bytes) | ConvertFrom-Json)
  } catch {
    throw "$Label did not return valid JSON: $($_.Exception.Message)"
  }
}

function Header-Values([hashtable] $Headers, [string] $Name) {
  if (-not $Headers.ContainsKey($Name)) { return @() }
  return @($Headers[$Name])
}

function Invoke-SmokeGet([System.Net.Http.HttpClient] $Client, [string] $Path) {
  $uri = "$BaseUrl$Path"
  $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Get, $uri)
  try {
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    try {
      $headers = @{}
      foreach ($header in $response.Headers) { $headers[$header.Key] = [string[]] @($header.Value) }
      foreach ($header in $response.Content.Headers) { $headers[$header.Key] = [string[]] @($header.Value) }
      $bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
      return [pscustomobject] @{
        StatusCode = [int] $response.StatusCode
        Headers = $headers
        Bytes = $bytes
        Text = [Text.Encoding]::UTF8.GetString($bytes)
        Uri = $uri
      }
    } finally {
      $response.Dispose()
    }
  } finally {
    $request.Dispose()
  }
}

function Assert-Status([object] $Response, [int] $Expected, [string] $Label) {
  if ($Response.StatusCode -ne $Expected) {
    $preview = $Response.Text.Substring(0, [Math]::Min(300, $Response.Text.Length))
    throw "$Label expected HTTP $Expected but got $($Response.StatusCode): $preview"
  }
  Write-Host "PASS  $Label HTTP $Expected" -ForegroundColor Green
}

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('context-landscape-human-release-smoke/1')

try {
  Write-Host "Human release smoke: $BaseUrl" -ForegroundColor Cyan

  $healthResponse = Invoke-SmokeGet $client '/health/ready'
  Assert-Status $healthResponse 200 'ready health'
  $health = ConvertFrom-SmokeJson $healthResponse.Bytes 'ready health'
  Assert-Equal $health.status 'ok' 'health status'
  Assert-Equal $health.persistence 'postgres' 'health persistence'

  $versionResponse = Invoke-SmokeGet $client '/version'
  Assert-Status $versionResponse 200 'version'
  $version = ConvertFrom-SmokeJson $versionResponse.Bytes 'version'
  Assert-Equal $version.releaseId $ExpectedReleaseId 'release ID'
  Assert-Equal $version.labPreflight.mode 'strict' 'gameplay lab preflight mode'
  Assert-Equal $version.labPreflight.sourcesVerified $true 'gameplay lab sources verified'
  Assert-Equal $version.labPreflight.rulesVerified $true 'gameplay lab rules verified'

  $sessionResponse = Invoke-SmokeGet $client '/api/auth/session'
  Assert-Status $sessionResponse 200 'anonymous auth session'
  $session = ConvertFrom-SmokeJson $sessionResponse.Bytes 'anonymous auth session'
  Assert-Equal $session.schemaVersion 1 'auth session schema'
  Assert-Equal $session.authenticated $false 'auth session is anonymous'
  Assert-True ($null -eq $session.account) 'anonymous auth session has no account'
  Assert-True ($null -eq $session.csrfToken) 'anonymous auth session has no CSRF token'

  $protectedResponse = Invoke-SmokeGet $client '/api/hangar/fleets'
  Assert-Status $protectedResponse 401 'protected hangar route'
  $protectedContentTypes = @(Header-Values $protectedResponse.Headers 'Content-Type')
  Assert-True (($protectedContentTypes -join ',') -match '^application/json(?:;|,|$)') 'protected route returns application JSON, not gallery authentication'
  $protected = ConvertFrom-SmokeJson $protectedResponse.Bytes 'protected hangar route'
  Assert-Equal $protected.error 'authentication_required' 'protected route application error'

  $oauthResponse = Invoke-SmokeGet $client '/api/auth/discord/start?returnTo=%2Flandscape%2F%3Fview%3Dhangar'
  Assert-Status $oauthResponse 302 'Discord OAuth start without redirect following'
  $oauthLocations = @(Header-Values $oauthResponse.Headers 'Location')
  Assert-Equal $oauthLocations.Count 1 'Discord OAuth redirect location count'
  $oauthLocation = [string] $oauthLocations[0]
  Assert-True ($oauthLocation -match '^https://discord\.com/oauth2/authorize\?') 'Discord OAuth redirect target'
  Assert-True ($oauthLocation -match '(?:\?|&)scope=identify(?:&|$)') 'Discord OAuth identify-only scope'
  Assert-True ($oauthLocation -match '(?:\?|&)response_type=code(?:&|$)') 'Discord OAuth authorization-code flow'
  Assert-True ($oauthLocation -match '(?:\?|&)code_challenge_method=S256(?:&|$)') 'Discord OAuth PKCE S256 flow'
  $oauthCookies = @(Header-Values $oauthResponse.Headers 'Set-Cookie')
  Assert-True (($oauthCookies -join ';') -match 'cl_oauth_state=') 'Discord OAuth state cookie issued'
  Assert-True (($oauthCookies -join ';') -match 'cl_oauth_verifier=') 'Discord OAuth verifier cookie issued'
  foreach ($cookie in $oauthCookies) {
    Assert-True ($cookie -match '(?i)(?:^|;)\s*HttpOnly(?:;|$)') 'OAuth cookie is HttpOnly'
    Assert-True ($cookie -match '(?i)(?:^|;)\s*SameSite=Lax(?:;|$)') 'OAuth cookie is SameSite=Lax'
    Assert-True ($cookie -match '(?i)(?:^|;)\s*Secure(?:;|$)') 'OAuth cookie is Secure'
  }

  $offset = 0
  $assetIds = New-Object 'System.Collections.Generic.HashSet[string]'
  $sampleMediaPath = $null
  do {
    $catalogResponse = Invoke-SmokeGet $client "/api/art/catalog?offset=$offset&limit=100"
    Assert-Status $catalogResponse 200 "art catalog page at offset $offset"
    $catalog = ConvertFrom-SmokeJson $catalogResponse.Bytes "art catalog page at offset $offset"
    Assert-Equal $catalog.schemaVersion 1 "art catalog schema at offset $offset"
    Assert-Equal $catalog.catalogHash $ExpectedCatalogHash "art catalog hash at offset $offset"
    Assert-Equal $catalog.total $ExpectedCatalogItems "art catalog total at offset $offset"
    Assert-Equal $catalog.offset $offset "art catalog response offset $offset"
    $pageItems = @($catalog.items)
    $expectedPageItems = [Math]::Min(100, $ExpectedCatalogItems - $offset)
    Assert-Equal $pageItems.Count $expectedPageItems "art catalog page size at offset $offset"
    foreach ($item in $pageItems) {
      if ([string]::IsNullOrWhiteSpace([string] $item.assetId)) {
        throw "art catalog item at offset $offset has no asset ID"
      }
      if (-not $assetIds.Add([string] $item.assetId)) {
        throw "art catalog asset ID is duplicated: $($item.assetId)"
      }
      if ($null -eq $sampleMediaPath -and ([string] $item.thumbnailSrc).StartsWith('/media/art/')) {
        $sampleMediaPath = [string] $item.thumbnailSrc
      }
    }
    if ($null -eq $catalog.nextOffset) { break }
    $nextOffset = [int] $catalog.nextOffset
    Assert-True ($nextOffset -gt $offset) "art catalog pagination advances from offset $offset"
    $offset = $nextOffset
  } while ($true)
  Assert-Equal $assetIds.Count $ExpectedCatalogItems 'full catalog item count'
  Assert-True (-not [string]::IsNullOrWhiteSpace($sampleMediaPath)) 'catalog supplies a media sample'

  $mediaResponse = Invoke-SmokeGet $client $sampleMediaPath
  Assert-Status $mediaResponse 200 'sample catalog media'
  $mediaContentTypes = @(Header-Values $mediaResponse.Headers 'Content-Type')
  Assert-True (($mediaContentTypes -join ',') -match '^image/webp(?:;|,|$)') 'sample catalog media content type is WebP'
  Assert-True ($mediaResponse.Bytes.Length -ge 12) 'sample catalog media is non-empty'
  $riff = [Text.Encoding]::ASCII.GetString($mediaResponse.Bytes, 0, 4)
  $webp = [Text.Encoding]::ASCII.GetString($mediaResponse.Bytes, 8, 4)
  Assert-True ($riff -eq 'RIFF' -and $webp -eq 'WEBP') 'sample catalog media has a WebP container'

  $landscapeResponse = Invoke-SmokeGet $client $AppEntryPath
  Assert-Status $landscapeResponse 200 'Landscape HTML entry point'
  $landscapeContentTypes = @(Header-Values $landscapeResponse.Headers 'Content-Type')
  Assert-True (($landscapeContentTypes -join ',') -match '^text/html(?:;|,|$)') 'Landscape entry point returns HTML'
  Assert-True ($landscapeResponse.Text -match '<title>Context Landscape</title>') 'Landscape HTML is the Context Landscape app'
  Assert-True ($landscapeResponse.Text -match '<div id="root"></div>') 'Landscape HTML contains the application root'

  Write-Host "HUMAN RELEASE SMOKE PASS: release=$ExpectedReleaseId catalog=$ExpectedCatalogHash items=$ExpectedCatalogItems" -ForegroundColor Green
} finally {
  $client.Dispose()
  $handler.Dispose()
}
