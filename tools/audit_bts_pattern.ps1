$edges = Get-Content 'backend/src/main/resources/data/edges.json' -Raw | ConvertFrom-Json
$nodes = Get-Content 'backend/src/main/resources/data/nodes_all.json' -Raw | ConvertFrom-Json

# Verifier le BTS Gestion PME Casa (filiere BTS accessible) pour comprendre le pattern
Write-Host "=== PATTERN REFERENCE : BTS Gestion PME - Centre BTS Casablanca ==="
$pmeCasaId = $null
$pmeCasa = $nodes | Where-Object { $_.nom_fr -like '*Gestion*PME*Casablanca*' -and $_.type -eq 'FILIERE' }
if ($pmeCasa) {
    $pmeCasaId = $pmeCasa.id
    Write-Host "FILIERE: $($pmeCasa.nom_fr) ($pmeCasaId)"
    $outgoing = $edges | Where-Object { $_.source_id -eq $pmeCasaId }
    Write-Host "  Aretes sortantes ($($outgoing.Count)):"
    foreach ($e in $outgoing) {
        $tgt = $nodes | Where-Object { $_.id -eq $e.target_id }
        Write-Host "    [$($e.type_lien)] $($tgt.type) '$($tgt.nom_fr)'"
    }
    $incoming = $edges | Where-Object { $_.target_id -eq $pmeCasaId }
    Write-Host "  Aretes entrantes ($($incoming.Count)):"
    foreach ($e in $incoming) {
        $src = $nodes | Where-Object { $_.id -eq $e.source_id }
        Write-Host "    [$($e.type_lien)] $($src.type) '$($src.nom_fr)'"
    }
}

# Verifier Agent de depot - est-il deja accessible ?
Write-Host ""
Write-Host "=== Agent de depot - verifier autres RECRUTEMENT ==="
$agentDepotId = 'd91eb0da-99e3-4e8b-9821-4f0938d35e7c'
$agentRecrutEdges = $edges | Where-Object { $_.target_id -eq $agentDepotId }
foreach ($e in $agentRecrutEdges) {
    $src = $nodes | Where-Object { $_.id -eq $e.source_id }
    Write-Host "  [$($e.type_lien)] source: '$($src.nom_fr)' ($($e.source_id))"
    # Verifier si cette source est accessible
    $srcIncoming = $edges | Where-Object { $_.target_id -eq $src.id }
    Write-Host "    -> Aretes entrantes sur cette source: $($srcIncoming.Count)"
    foreach ($ei in $srcIncoming) {
        $srcSrc = $nodes | Where-Object { $_.id -eq $ei.source_id }
        Write-Host "       [$($ei.type_lien)] $($srcSrc.type) '$($srcSrc.nom_fr)'"
    }
}

# Verifier doublons potentiels si on ajoute RECRUTEMENT depuis BTS_Compta_Casa
Write-Host ""
Write-Host "=== Verif doublons: aretes existantes entre BTS_Compta_Casa et les 10 METIERs ==="
$btsCasaId = '3acb75a6-1d8c-afe0-b5b2-dc4352953f75'
$metierIds = @(
    '3096f6a1-4ec8-45cd-9d8b-1e6954c35919',  # Analyste en donnees urbaines
    '3363b0b3-b995-478a-b6e5-f77d3a602cbb',  # Conseiller en investissement ecoresponsable
    '35ae9c95-2272-40cb-91e2-21c4717e8531',  # percepteur
    '64c6bb31-18e1-418e-99db-3dff6de3a3f0',  # guichetier payeur
    '7dbc75c1-222f-4bba-860c-f3ed0d0c1fb2',  # Analyste ESG
    '813147c4-56f7-4afd-8eab-7973d5ab335b',  # Analyste en evaluation economique H2
    'afe090f4-598a-4855-b64a-33ad494139bd',  # Charge d'affaires Environnement
    'b0b42567-ece6-49c5-8210-698294c4f038',  # Analyste en Investissements
    'b6b342b7-81f2-4981-86e6-4cf3753c51b3',  # Analyste de donnees agroalimentaires
    'd91eb0da-99e3-4e8b-9821-4f0938d35e7c',  # Agent de depot
    'e81381da-8e24-4028-a82f-ab63339b4d50'   # Agent des finances
)
$existingEdges = $edges | Where-Object { $_.source_id -eq $btsCasaId -and $metierIds -contains $_.target_id }
Write-Host "  Aretes deja existantes: $($existingEdges.Count)"
if ($existingEdges.Count -gt 0) {
    foreach ($e in $existingEdges) {
        $tgt = $nodes | Where-Object { $_.id -eq $e.target_id }
        Write-Host "    [$($e.type_lien)] '$($tgt.nom_fr)'"
    }
}
