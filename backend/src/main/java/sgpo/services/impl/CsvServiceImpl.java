package sgpo.services.impl;

import com.opencsv.CSVReader;
import com.opencsv.CSVWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import sgpo.entities.Edge;
import sgpo.entities.Node;
import sgpo.enums.EdgeType;
import sgpo.enums.NodeType;
import sgpo.enums.TypeAcces;
import sgpo.exceptions.CsvException;
import sgpo.repositories.EdgeRepository;
import sgpo.repositories.NodeRepository;
import sgpo.services.CsvService;

import java.io.*;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CsvServiceImpl implements CsvService {

    private final NodeRepository nodeRepository;
    private final EdgeRepository edgeRepository;

    @Override
    public ByteArrayInputStream exportNodes() throws CsvException {
        List<Node> nodes = nodeRepository.findAll();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             CSVWriter writer = new CSVWriter(new OutputStreamWriter(out))) {
            String[] header = {"id", "type", "code", "nomFr", "nomAr", "description", "dureeMois", "coutEstime", "secteur", "ville", "scoreIa", "actif"};
            writer.writeNext(header);
            for (Node n : nodes) {
                String[] row = {n.getId(), n.getType().name(), n.getCode(), n.getNomFr(), n.getNomAr(), n.getDescription(),
                        String.valueOf(n.getDureeMois()), String.valueOf(n.getCoutEstime()), n.getSecteur(), n.getVille(),
                        String.valueOf(n.getScoreIa()), String.valueOf(n.getActif())};
                writer.writeNext(row);
            }
            writer.flush();
            return new ByteArrayInputStream(out.toByteArray());
        } catch (IOException e) {
            throw new CsvException("Erreur lors de l'export CSV.");
        }
    }

    @Override
    public void importNodes(MultipartFile file) throws CsvException {
        try (CSVReader reader = new CSVReader(new InputStreamReader(file.getInputStream()))) {
            List<String[]> rows = reader.readAll();
            for (int i = 1; i < rows.size(); i++) {
                String[] row = rows.get(i);
                Node node = new Node();
                node.setId(row[0]);
                node.setType(NodeType.valueOf(row[1]));
                node.setCode(row[2]);
                node.setNomFr(row[3]);
                node.setNomAr(row[4]);
                node.setDescription(row[5]);
                node.setDureeMois(parseIntOrNull(row[6]));
                node.setCoutEstime(parseDoubleOrNull(row[7]));
                node.setSecteur(row[8]);
                node.setVille(row[9]);
                node.setScoreIa(parseDoubleOrNull(row[10]));
                node.setActif(Boolean.parseBoolean(row[11]));
                nodeRepository.save(node);
            }
        } catch (Exception e) {
            throw new CsvException("Erreur lors de l'import CSV.");
        }
    }
    @Override
    public ByteArrayInputStream exportEdges() throws CsvException {
        List<Edge> edges = edgeRepository.findAll();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream();
             CSVWriter writer = new CSVWriter(new OutputStreamWriter(out))) {

            String[] header = {"id", "source_id", "target_id", "type_lien", "taux_reussite",
                    "cout_supplementaire", "duree_supplementaire_mois", "prerequis_notes",
                    "moyenne_minimale", "type_acces"};
            writer.writeNext(header);

            for (Edge e : edges) {
                String[] row = {
                        e.getId(),
                        e.getSource() != null ? e.getSource().getId() : "",
                        e.getTarget() != null ? e.getTarget().getId() : "",
                        e.getTypeLien().name(),
                        String.valueOf(e.getTauxReussite()),
                        String.valueOf(e.getCoutSupplementaire()),
                        String.valueOf(e.getDureeSupplementaireMois()),
                        e.getPrerequisNotes(),
                        String.valueOf(e.getMoyenneMinimale()),
                        e.getTypeAcces() != null ? e.getTypeAcces().name() : ""
                };
                writer.writeNext(row);
            }

            writer.flush();
            return new ByteArrayInputStream(out.toByteArray());
        } catch (IOException e) {
            throw new CsvException("Erreur lors de l'export CSV des arêtes.");
        }
    }

    @Override
    public void importEdges(MultipartFile file) throws CsvException {
        try (CSVReader reader = new CSVReader(new InputStreamReader(file.getInputStream()))) {
            List<String[]> rows = reader.readAll();
            for (int i = 1; i < rows.size(); i++) {
                String[] row = rows.get(i);
                Edge edge = new Edge();
                edge.setId(row[0]);
                // Récupérer les nœuds source et target par leur ID
                Node source = nodeRepository.findById(row[1])
                        .orElseThrow(() -> new CsvException("Nœud source introuvable : " + row[1]));
                Node target = nodeRepository.findById(row[2])
                        .orElseThrow(() -> new CsvException("Nœud cible introuvable : " + row[2]));
                edge.setSource(source);
                edge.setTarget(target);
                edge.setTypeLien(EdgeType.valueOf(row[3]));
                edge.setTauxReussite(parseDoubleOrNull(row[4]));
                edge.setCoutSupplementaire(parseDoubleOrNull(row[5]));
                edge.setDureeSupplementaireMois(parseIntOrNull(row[6]));
                edge.setPrerequisNotes(row[7]);
                edge.setMoyenneMinimale(parseDoubleOrNull(row[8]));
                if (row[9] != null && !row[9].isBlank()) {
                    edge.setTypeAcces(TypeAcces.valueOf(row[9]));
                }
                edgeRepository.save(edge);
            }
        } catch (CsvException e) {
            throw e;
        } catch (Exception e) {
            throw new CsvException("Erreur lors de l'import CSV des arêtes.");
        }
    }

    private Integer parseIntOrNull(String s) { try { return Integer.parseInt(s); } catch (Exception e) { return null; } }
    private Double parseDoubleOrNull(String s) { try { return Double.parseDouble(s); } catch (Exception e) { return null; } }
}