package sgpo.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import sgpo.enums.EdgeType;
import sgpo.enums.TypeAcces;

import java.time.LocalDateTime;

@Entity
@Table(name = "edge")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Edge {
    @Id
    private String id;

    @ManyToOne
    @JoinColumn(name = "source_id", nullable = false)
    private Node source;

    @ManyToOne
    @JoinColumn(name = "target_id", nullable = false)
    private Node target;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private EdgeType typeLien;

    private Double tauxReussite;

    private Double coutSupplementaire;

    private Integer dureeSupplementaireMois;

    @Column(columnDefinition = "TEXT")
    private String prerequisNotes;

    private Double moyenneMinimale;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private TypeAcces typeAcces;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    public void prePersist() {
        if (this.id == null || this.id.isBlank()) {
            this.id = java.util.UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }
}
