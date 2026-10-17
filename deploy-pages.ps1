# 把小财本推送到 GitHub 公开仓库并启用 Pages（手机访问入口）
$ErrorActionPreference = 'Continue'
$dir = 'D:\test_harness\finance-app'

$repo = Read-Host '仓库地址（如 https://github.com/Jau1a/xiaocaiben.git）'
$pat = Read-Host 'GitHub Personal Access Token（粘贴后回车，不显示）'
$token = $pat.Trim()
if ($token -match '^(ghp_|github_pat_)') {
  $remote = ($repo.Trim() -replace '^https://', "https://x-access-token:$token@")
} else {
  $remote = $repo.Trim()
}

Push-Location $dir
if (-not (Test-Path .git)) { git init -b main | Out-Null }
if (git remote | Select-String -Quiet '^origin') { git remote remove origin }
git remote add origin $remote
if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'git remote add 失败，请检查仓库地址' }
git add .
git -c user.name="jiuwanli" -c user.email="radar@local" commit -m "xiaocaiben v1"
if ($LASTEXITCODE -ne 0) { Write-Host '没有需要提交的变更，继续推送…' }
git push -u origin main
if ($LASTEXITCODE -ne 0) { Pop-Location; throw '推送失败：请确认仓库已创建且为公开仓库、Token勾选了repo权限' }
Pop-Location

Write-Host ''
Write-Host '推送完成。接下来两步：'
Write-Host '1) 浏览器打开仓库页面 -> Settings -> Pages -> Source 选 "Deploy from a branch" -> Branch 选 main / (root) -> Save；'
$u = $repo.Trim() -replace '^https://github.com/', '' -replace '\.git$', ''
$parts = $u -split '/'
if ($parts.Count -ge 2) {
  Write-Host ('2) 约1分钟后手机/电脑访问 https://' + $parts[0] + '.github.io/' + $parts[1] + '/ 即可使用。')
} else {
  Write-Host '2) 约1分钟后访问 https://<用户名>.github.io/<仓库名>/ 即可使用。'
}
Write-Host '   注意：仓库必须是 Public（公开），免费账号的 Pages 不支持私有仓库。'
