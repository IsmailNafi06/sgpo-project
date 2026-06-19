package sgpo.services.impl;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;
import sgpo.dtos.CheminDTO;
import sgpo.dtos.EtapeDTO;
import sgpo.exceptions.ExportException;
import sgpo.services.ExportService;

import java.io.ByteArrayOutputStream;

@Service
public class ExportServiceImpl implements ExportService {

    @Override
    public byte[] generatePdf(CheminDTO chemin) throws ExportException {
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4);

        try {
            PdfWriter.getInstance(document, outputStream);
            document.open();

            Font titleFont = new Font(Font.HELVETICA, 18, Font.BOLD);
            Font subtitleFont = new Font(Font.HELVETICA, 12, Font.BOLD);
            Font normalFont = new Font(Font.HELVETICA, 10, Font.NORMAL);

            // Titre
            document.add(new Paragraph("Parcours d'orientation", titleFont));
            document.add(new Paragraph(" "));

            // Informations générales
            String metier = chemin.getEtapes().get(chemin.getEtapes().size() - 1).getNom();
            document.add(new Paragraph("Métier visé : " + metier, subtitleFont));
            document.add(new Paragraph("Durée totale : " + (chemin.getDureeTotale() / 12) + " ans"));
            document.add(new Paragraph("Score : " + chemin.getScoreComposite()));
            document.add(new Paragraph(" "));

            // Étapes
            document.add(new Paragraph("Étapes du parcours :", subtitleFont));
            for (EtapeDTO etape : chemin.getEtapes()) {
                document.add(new Paragraph("• " + etape.getNom() + " (" + etape.getType() + ")", normalFont));
                if (etape.getDuree() != null) {
                    document.add(new Paragraph("   Durée : " + etape.getDuree() + " mois", normalFont));
                }
                if (etape.getVille() != null) {
                    document.add(new Paragraph("   Ville : " + etape.getVille(), normalFont));
                }
            }

            document.add(new Paragraph(" "));
            document.add(new Paragraph("Interprétation :", subtitleFont));
            document.add(new Paragraph(chemin.getInterpretation(), normalFont));

            document.close();
        } catch (Exception e) {
            throw new ExportException("Erreur lors de la génération du PDF : " + e.getMessage(), e);
        }

        return outputStream.toByteArray();
    }
}